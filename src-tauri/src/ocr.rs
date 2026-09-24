use pdfium_render::prelude::*;
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};

const MAX_PDF_BYTES: usize = 50 * 1024 * 1024;
const MAX_PAGES: usize = 500;
const OCR_WIDTH_PX: i32 = 2400;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfInspection {
    pub pages: Vec<String>,
    pub ocr_pages: Vec<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrDocument {
    pub pages: Vec<String>,
    pub ocr_page_count: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OcrProgress {
    current_page: usize,
    total_pages: usize,
    phase: &'static str,
}

#[derive(Clone)]
pub struct OcrState {
    inner: Arc<OcrWorker>,
}

struct OcrWorker {
    assets: OcrAssets,
    generation: AtomicU64,
    pdfium: Mutex<Option<Pdfium>>,
}

struct OcrAssets {
    pdfium: PathBuf,
    tesseract: PathBuf,
    tessdata: PathBuf,
}

impl OcrState {
    pub fn from_directory(directory: PathBuf) -> Self {
        let directory = command_compatible_path(directory);
        Self {
            inner: Arc::new(OcrWorker {
                assets: OcrAssets {
                    pdfium: directory.join("pdfium/bin/pdfium.dll"),
                    tesseract: directory.join("tesseract/tesseract.exe"),
                    tessdata: directory.join("tesseract/tessdata"),
                },
                generation: AtomicU64::new(0),
                pdfium: Mutex::new(None),
            }),
        }
    }

    pub fn cancel(&self) {
        self.inner.generation.fetch_add(1, Ordering::SeqCst);
    }

    pub async fn recognize(&self, bytes: Vec<u8>, app: AppHandle) -> Result<OcrDocument, String> {
        validate_pdf(&bytes)?;
        let generation = self.inner.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let worker = Arc::clone(&self.inner);
        tauri::async_runtime::spawn_blocking(move || {
            worker.run(bytes, generation, |progress| {
                let _ = app.emit("ocr-progress", progress);
            })
        })
        .await
        .map_err(|error| format!("The OCR worker stopped unexpectedly: {error}"))?
    }
}

impl OcrWorker {
    fn run(
        &self,
        bytes: Vec<u8>,
        generation: u64,
        mut progress: impl FnMut(OcrProgress),
    ) -> Result<OcrDocument, String> {
        let inspection = inspect_pdf_bytes(&bytes)?;
        let total_pages = inspection.pages.len();
        let ocr_page_count = inspection.ocr_pages.len();
        if ocr_page_count == 0 {
            return Ok(OcrDocument {
                pages: inspection.pages,
                ocr_page_count,
            });
        }
        self.assets.validate()?;
        let temp = TempDirectory::new(generation)?;
        let mut pdfium = self
            .pdfium
            .lock()
            .map_err(|_| "The local PDF renderer is unavailable.".to_string())?;
        if pdfium.is_none() {
            let bindings = Pdfium::bind_to_library(&self.assets.pdfium)
                .map_err(|error| format!("SIREN could not load its local PDF renderer: {error}"))?;
            *pdfium = Some(Pdfium::new(bindings));
        }
        let document = pdfium
            .as_ref()
            .expect("PDFium initialized above")
            .load_pdf_from_byte_vec(bytes, None)
            .map_err(|_| {
                "SIREN could not render this PDF. It may be corrupt or encrypted.".to_string()
            })?;
        let mut pages = inspection.pages;

        for page_number in 1..=total_pages {
            self.check_cancelled(generation)?;
            if !inspection.ocr_pages.contains(&page_number) {
                progress(OcrProgress {
                    current_page: page_number,
                    total_pages,
                    phase: "Keeping embedded text",
                });
                continue;
            }
            progress(OcrProgress {
                current_page: page_number,
                total_pages,
                phase: "Recognizing text",
            });
            let page = document
                .pages()
                .get((page_number - 1) as i32)
                .map_err(|_| format!("SIREN could not render page {page_number}."))?;
            let image_path = temp.path().join(format!("page-{page_number}.jpg"));
            page.render_with_config(
                &PdfRenderConfig::new()
                    .set_target_width(OCR_WIDTH_PX)
                    .render_annotations(true)
                    .render_form_data(true),
            )
            .and_then(|bitmap| bitmap.as_image())
            .map_err(|_| format!("SIREN could not render page {page_number}."))?
            .save(&image_path)
            .map_err(|_| format!("SIREN could not prepare page {page_number} for OCR."))?;

            let mut command = Command::new(&self.assets.tesseract);
            command
                .arg(&image_path)
                .arg("stdout")
                .args(["--tessdata-dir"])
                .arg(&self.assets.tessdata)
                .args(["-l", "eng", "--oem", "1", "--psm", "3"])
                .current_dir(temp.path());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            let output = command
                .output()
                .map_err(|_| "SIREN could not start its local OCR engine.".to_string())?;
            let _ = fs::remove_file(&image_path);
            self.check_cancelled(generation)?;
            if !output.status.success() {
                return Err(format!(
                    "Local OCR failed on page {page_number}. You can retry or cancel without changing the source PDF."
                ));
            }
            pages[page_number - 1] = normalize_page_text(&String::from_utf8_lossy(&output.stdout));
        }

        if pages.iter().all(|page| !has_readable_text(page)) {
            return Err("OCR finished, but no readable English text was found.".into());
        }
        Ok(OcrDocument {
            pages,
            ocr_page_count,
        })
    }

    fn check_cancelled(&self, generation: u64) -> Result<(), String> {
        if self.inner_generation() == generation {
            Ok(())
        } else {
            Err("OCR cancelled. The source PDF was not changed.".into())
        }
    }

    fn inner_generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }
}

impl OcrAssets {
    fn validate(&self) -> Result<(), String> {
        if !self.pdfium.is_file() || !self.tesseract.is_file() {
            return Err(
                "SIREN's local OCR components are missing. Reinstall SIREN and try again.".into(),
            );
        }
        if !self.tessdata.join("eng.traineddata").is_file() {
            return Err(
                "SIREN's English OCR data is missing. Reinstall SIREN and try again.".into(),
            );
        }
        Ok(())
    }
}

pub fn inspect_pdf_bytes(bytes: &[u8]) -> Result<PdfInspection, String> {
    validate_pdf(bytes)?;
    let pages = pdf_extract::extract_text_from_mem_by_pages(bytes)
        .map_err(|_| "SIREN could not read this PDF. It may be corrupt or encrypted.".to_string())?
        .into_iter()
        .map(|page| normalize_page_text(&page))
        .collect::<Vec<_>>();
    if pages.is_empty() {
        return Err("This PDF does not contain any pages.".into());
    }
    if pages.len() > MAX_PAGES {
        return Err(format!(
            "PDF files must contain {MAX_PAGES} pages or fewer."
        ));
    }
    let ocr_pages = pages
        .iter()
        .enumerate()
        .filter_map(|(index, page)| (!has_readable_text(page)).then_some(index + 1))
        .collect();
    Ok(PdfInspection { pages, ocr_pages })
}

fn validate_pdf(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_PDF_BYTES {
        return Err("PDF files must be 50 MB or smaller.".into());
    }
    if !bytes.starts_with(b"%PDF-") {
        return Err("This file is not a valid PDF.".into());
    }
    Ok(())
}

fn normalize_page_text(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

fn has_readable_text(text: &str) -> bool {
    text.chars()
        .filter(|character| character.is_alphanumeric())
        .count()
        >= 20
}

struct TempDirectory(PathBuf);

impl TempDirectory {
    fn new(generation: u64) -> Result<Self, String> {
        let path =
            std::env::temp_dir().join(format!("siren-ocr-{}-{generation}", std::process::id()));
        fs::create_dir(&path)
            .map_err(|_| "SIREN could not create a temporary OCR workspace.".to_string())?;
        Ok(Self(path))
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub fn default_ocr_directory() -> PathBuf {
    std::env::var_os("SIREN_OCR_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("src-tauri has a project parent")
                .join("ocr")
        })
}

pub fn ocr_directory(app: &tauri::App) -> Result<PathBuf, tauri::Error> {
    if std::env::var_os("SIREN_OCR_DIR").is_some() || cfg!(debug_assertions) {
        return Ok(default_ocr_directory());
    }
    app.path().resolve("../ocr", BaseDirectory::Resource)
}

#[cfg(windows)]
fn command_compatible_path(path: PathBuf) -> PathBuf {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = value.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path
    }
}

#[cfg(not(windows))]
fn command_compatible_path(path: PathBuf) -> PathBuf {
    path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_text_and_image_only_pages() {
        let text = inspect_pdf_bytes(include_bytes!("../../tests/fixtures/text-document.pdf"))
            .expect("text PDF should parse");
        assert!(text.ocr_pages.is_empty());
        assert!(text.pages[0].contains("This PDF contains a real text layer."));

        let scan = inspect_pdf_bytes(include_bytes!("../../tests/fixtures/scanned-no-text.pdf"))
            .expect("scanned PDF should parse");
        assert_eq!(scan.ocr_pages, vec![1]);

        let mixed = inspect_pdf_bytes(include_bytes!("../../tests/fixtures/mixed-text-scan.pdf"))
            .expect("mixed PDF should parse");
        assert_eq!(mixed.ocr_pages, vec![2]);
        assert!(mixed.pages[0].contains("This PDF contains a real text layer."));
    }

    #[test]
    fn readable_text_threshold_rejects_page_numbers() {
        assert!(!has_readable_text("Page 4"));
        assert!(has_readable_text(
            "A useful sentence has enough text to read."
        ));
    }

    #[test]
    fn cancellation_invalidates_stale_work() {
        let state = OcrState::from_directory(default_ocr_directory());
        state.cancel();
        assert_eq!(
            state.inner.check_cancelled(0).unwrap_err(),
            "OCR cancelled. The source PDF was not changed."
        );
    }

    #[cfg(windows)]
    #[test]
    fn removes_windows_verbatim_prefix_for_tesseract() {
        assert_eq!(
            command_compatible_path(PathBuf::from(r"\\?\C:\SIREN\ocr")),
            PathBuf::from(r"C:\SIREN\ocr")
        );
        assert_eq!(
            command_compatible_path(PathBuf::from(r"\\?\UNC\server\share\ocr")),
            PathBuf::from(r"\\server\share\ocr")
        );
    }

    #[test]
    #[ignore = "requires local PDFium and Tesseract assets"]
    fn recognizes_scanned_fixture() {
        let state = OcrState::from_directory(default_ocr_directory());
        let scan = state.inner.run(
            include_bytes!("../../tests/fixtures/scanned-no-text.pdf").to_vec(),
            0,
            |_| {},
        );
        assert!(scan.unwrap().pages[0].contains("SIREN scanned PDF fixture"));

        let mixed = state.inner.run(
            include_bytes!("../../tests/fixtures/mixed-text-scan.pdf").to_vec(),
            0,
            |_| {},
        );
        let pages = mixed.unwrap().pages;
        assert!(pages[0].contains("This PDF contains a real text layer."));
        assert!(pages[1].contains("SIREN scanned PDF fixture"));
    }
}
