mod ocr;
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
fn inspect_pdf(request: Request<'_>) -> Result<ocr::PdfInspection, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("SIREN received an invalid PDF payload.".into());
    };
    ocr::inspect_pdf_bytes(bytes)
}

#[tauri::command]
async fn ocr_pdf(
    app: tauri::AppHandle,
    state: tauri::State<'_, ocr::OcrState>,
    request: Request<'_>,
) -> Result<ocr::OcrDocument, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("SIREN received an invalid PDF payload.".into());
    };
    state.recognize(bytes.to_vec(), app).await
}

#[tauri::command]
fn cancel_ocr(state: tauri::State<'_, ocr::OcrState>) {
    state.cancel();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let model_directory = tts::model_directory(app)?;
            app.manage(tts::TtsState::from_model_directory(model_directory));
            let ocr_directory = ocr::ocr_directory(app)?;
            app.manage(ocr::OcrState::from_directory(ocr_directory));
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(_error) = app_handle.state::<tts::TtsState>().warmup().await {
                    #[cfg(debug_assertions)]
                    eprintln!("[SIREN TTS] startup warmup failed: {_error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cancel_ocr,
            inspect_pdf,
            ocr_pdf,
            tts_status,
            tts_synthesize
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}
