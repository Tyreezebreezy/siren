mod tts;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TtsStatus {
    ready: bool,
    voices: Vec<String>,
}

#[tauri::command]
fn tts_status(state: tauri::State<'_, tts::TtsState>) -> TtsStatus {
    let (ready, voices) = state.status();
    TtsStatus { ready, voices }
}

#[tauri::command]
async fn tts_synthesize(
    state: tauri::State<'_, tts::TtsState>,
    text: String,
    voice: String,
    speed: f32,
) -> Result<Response, String> {
    state
        .synthesize(&text, &voice, speed)
        .await
        .map(Response::new)
}

#[tauri::command]
fn extract_pdf(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("SIREN received an invalid PDF payload.".into());
    };
    extract_pdf_bytes(bytes)
}

fn extract_pdf_bytes(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > 50 * 1024 * 1024 {
        return Err("PDF files must be 50 MB or smaller.".into());
    }
    if !bytes.starts_with(b"%PDF-") {
        return Err("This file is not a valid PDF.".into());
    }
    let text = pdf_extract::extract_text_from_mem(bytes).map_err(|_| {
        "SIREN could not read this PDF. It may be corrupt or encrypted.".to_string()
    })?;
    let text = text.trim();
    if text.is_empty() {
        return Err(
            "No readable text was found in this PDF. OCR is not supported in SIREN v0.1.".into(),
        );
    }
    Ok(text.to_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let model_directory = tts::model_directory(app)?;
            app.manage(tts::TtsState::from_model_directory(model_directory));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            extract_pdf,
            tts_status,
            tts_synthesize
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_pdf_bytes() {
        assert_eq!(
            extract_pdf_bytes(b"not a pdf").unwrap_err(),
            "This file is not a valid PDF."
        );
    }

    #[test]
    fn extracts_text_pdf_and_rejects_scanned_pdf() {
        let text_pdf = include_bytes!("../../tests/fixtures/text-document.pdf");
        assert!(extract_pdf_bytes(text_pdf)
            .unwrap()
            .contains("This PDF contains a real text layer."));

        let scanned_pdf = include_bytes!("../../tests/fixtures/scanned-no-text.pdf");
        assert_eq!(
            extract_pdf_bytes(scanned_pdf).unwrap_err(),
            "No readable text was found in this PDF. OCR is not supported in SIREN v0.1."
        );
    }
}
