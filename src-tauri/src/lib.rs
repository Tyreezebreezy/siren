mod tts;

use serde::Serialize;
use tauri::ipc::Response;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TtsStatus {
    ready: bool,
    voices: Vec<String>,
}

#[tauri::command]
fn tts_status() -> TtsStatus {
    let model_directory = tts::default_model_directory();
    let voices = tts::installed_voices(&model_directory);
    TtsStatus {
        ready: model_directory.join("model_quantized.onnx").is_file() && !voices.is_empty(),
        voices,
    }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(tts::TtsState::from_model_directory(
            tts::default_model_directory(),
        ))
        .invoke_handler(tauri::generate_handler![tts_status, tts_synthesize])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}
