use kokoro_en::{KokoroTts, Voice};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Instant,
};
use tauri::{path::BaseDirectory, Manager};
use tokio::sync::Mutex;

const SAMPLE_RATE: u32 = 24_000;

pub struct TtsState {
    assets: ModelAssets,
    engine: Mutex<Option<TtsEngine>>,
}

struct ModelAssets {
    model: PathBuf,
    voices: PathBuf,
}

enum TtsEngine {
    Kokoro(KokoroTts),
}

impl TtsState {
    pub fn from_model_directory(directory: PathBuf) -> Self {
        Self {
            assets: ModelAssets {
                model: directory.join("model_quantized.onnx"),
                voices: directory.join("voices"),
            },
            engine: Mutex::new(None),
        }
    }

    pub async fn synthesize(&self, text: &str, voice: &str, speed: f32) -> Result<Vec<u8>, String> {
        validate_request(text, voice, speed)?;
        self.assets.validate(voice)?;

        let request_started = Instant::now();
        let lock_started = Instant::now();
        let mut engine = self.engine.lock().await;
        let queue_wait = lock_started.elapsed();
        load_engine(&mut engine, &self.assets).await?;

        let synthesis_started = Instant::now();
        let samples = engine
            .as_ref()
            .expect("engine initialized above")
            .synthesize(text, voice, speed)
            .await?;
        let synthesis_seconds = synthesis_started.elapsed().as_secs_f64();
        let audio_seconds = samples.len() as f64 / SAMPLE_RATE as f64;
        debug_tts(format_args!(
            "chars={} queue_wait_ms={:.1} synthesis_ms={:.1} audio_ms={:.1} rtf={:.3} total_ms={:.1}",
            text.chars().count(),
            queue_wait.as_secs_f64() * 1_000.0,
            synthesis_seconds * 1_000.0,
            audio_seconds * 1_000.0,
            synthesis_seconds / audio_seconds.max(f64::EPSILON),
            request_started.elapsed().as_secs_f64() * 1_000.0,
        ));
        Ok(wav_from_samples(&samples))
    }

    pub async fn warmup(&self) -> Result<(), String> {
        if !self.assets.model.is_file() {
            return Err(format!(
                "Kokoro model is missing at {}.",
                self.assets.model.display()
            ));
        }
        let mut engine = self.engine.lock().await;
        load_engine(&mut engine, &self.assets).await?;
        // The real phrase also warms first-use phonemization and inference paths
        // that Kokoro's short constructor probes do not cover.
        engine
            .as_ref()
            .expect("engine initialized above")
            .synthesize("SIREN is ready.", "af_heart", 1.0)
            .await?;
        Ok(())
    }

    pub fn status(&self) -> (bool, Vec<String>) {
        let voices = installed_voices(
            self.assets
                .voices
                .parent()
                .expect("voice directory has a model directory parent"),
        );
        (self.assets.model.is_file() && !voices.is_empty(), voices)
    }
}

async fn load_engine(engine: &mut Option<TtsEngine>, assets: &ModelAssets) -> Result<(), String> {
    if engine.is_none() {
        let load_started = Instant::now();
        *engine = Some(TtsEngine::load(assets).await?);
        debug_tts(format_args!(
            "model_load_ms={:.1}",
            load_started.elapsed().as_secs_f64() * 1_000.0
        ));
    }
    Ok(())
}

fn debug_tts(_message: std::fmt::Arguments<'_>) {
    #[cfg(debug_assertions)]
    eprintln!("[SIREN TTS] {_message}");
}

impl ModelAssets {
    fn validate(&self, voice: &str) -> Result<(), String> {
        if !self.model.is_file() {
            return Err(format!(
                "Kokoro model is missing at {}.",
                self.model.display()
            ));
        }

        let voice_path = self.voices.join(format!("{voice}.bin"));
        if !voice_path.is_file() {
            return Err(format!("Voice '{voice}' is not installed."));
        }
        Ok(())
    }
}

impl TtsEngine {
    async fn load(assets: &ModelAssets) -> Result<Self, String> {
        if std::env::var_os("KOKORO_ORT_PROVIDER").is_none() {
            std::env::set_var("KOKORO_ORT_PROVIDER", "cpu");
        }
        KokoroTts::new(&assets.model, &assets.voices)
            .await
            .map(Self::Kokoro)
            .map_err(|error| format!("Kokoro could not load: {error}"))
    }

    async fn synthesize(&self, text: &str, voice: &str, speed: f32) -> Result<Vec<f32>, String> {
        match self {
            Self::Kokoro(engine) => engine
                .synth(text, Voice::new(voice).with_speed(speed))
                .await
                .map(|(samples, _)| samples)
                .map_err(|error| format!("Speech synthesis failed: {error}")),
        }
    }
}

fn validate_request(text: &str, voice: &str, speed: f32) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Enter text before playing it.".into());
    }
    if text.chars().count() > 1_000 {
        return Err("SIREN synthesizes text in bounded chunks.".into());
    }
    if !(0.5..=2.0).contains(&speed) {
        return Err("Reading speed must be between 0.5× and 2.0×.".into());
    }
    if voice.is_empty()
        || voice.len() > 64
        || !voice
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err("Voice name is invalid.".into());
    }
    Ok(())
}

fn wav_from_samples(samples: &[f32]) -> Vec<u8> {
    let data_len = samples.len() as u32 * 2;
    let mut wav = Vec::with_capacity(44 + data_len as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
    wav.extend_from_slice(&2_u16.to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        wav.extend_from_slice(&pcm.to_le_bytes());
    }
    wav
}

pub fn default_model_directory() -> PathBuf {
    std::env::var_os("SIREN_MODEL_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("src-tauri has a project parent")
                .join("models")
        })
}

pub fn model_directory(app: &tauri::App) -> Result<PathBuf, tauri::Error> {
    if std::env::var_os("SIREN_MODEL_DIR").is_some() || cfg!(debug_assertions) {
        return Ok(default_model_directory());
    }
    app.path().resolve("../models", BaseDirectory::Resource)
}

pub fn installed_voices(directory: &Path) -> Vec<String> {
    let mut voices = fs::read_dir(directory.join("voices"))
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| {
            (entry.path().extension()?.to_str()? == "bin")
                .then(|| entry.path().file_stem()?.to_str().map(str::to_owned))
                .flatten()
        })
        .collect::<Vec<_>>();
    voices.sort();
    voices
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_pcm_as_a_valid_wav() {
        let wav = wav_from_samples(&[-1.0, 0.0, 1.0]);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 6);
        assert_eq!(wav.len(), 50);
    }

    #[test]
    fn rejects_invalid_speed_and_voice_paths() {
        assert!(validate_request("Hello", "../voice", 1.0).is_err());
        assert!(validate_request("Hello", "af_heart", 2.1).is_err());
    }

    #[test]
    #[ignore = "requires local Kokoro model assets"]
    fn benchmarks_local_kokoro() {
        let state = TtsState::from_model_directory(default_model_directory());
        for text in [
            "SIREN measures local speech before changing the playback pipeline.",
            "A longer passage shows whether generation remains comfortably faster than real time on ordinary laptop hardware while the model session stays warm.",
            "Buffered reading combines neighboring sentences into moderate chunks. The current audio starts as soon as it is ready, while the next units synthesize in the background. A bounded queue keeps memory stable and lets Stop, navigation, voice, or speed changes invalidate late results safely.",
        ] {
            let wav = tauri::async_runtime::block_on(state.synthesize(text, "af_heart", 1.0))
                .expect("local benchmark synthesis should succeed");
            assert!(wav.len() > 44);
        }
    }

    #[test]
    #[ignore = "requires local Kokoro model assets"]
    fn benchmarks_cold_path() {
        let directory = default_model_directory();
        let assets = ModelAssets {
            model: directory.join("model_quantized.onnx"),
            voices: directory.join("voices"),
        };

        let started = Instant::now();
        let model = fs::read(&assets.model).expect("model should be readable");
        eprintln!(
            "[SIREN COLD] model_read_ms={:.1} bytes={}",
            started.elapsed().as_secs_f64() * 1_000.0,
            model.len()
        );
        drop(model);

        let started = Instant::now();
        let voice_bytes = fs::read_dir(&assets.voices)
            .expect("voice directory should be readable")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.path().extension().and_then(|value| value.to_str()) == Some("bin")
            })
            .map(|entry| {
                fs::read(entry.path())
                    .expect("voice should be readable")
                    .len()
            })
            .sum::<usize>();
        eprintln!(
            "[SIREN COLD] voice_read_ms={:.1} bytes={}",
            started.elapsed().as_secs_f64() * 1_000.0,
            voice_bytes
        );

        let started = Instant::now();
        let engine =
            tauri::async_runtime::block_on(TtsEngine::load(&assets)).expect("engine should load");
        eprintln!(
            "[SIREN COLD] engine_session_ms={:.1}",
            started.elapsed().as_secs_f64() * 1_000.0
        );

        let text = "SIREN measures local speech before changing the playback pipeline.";
        let started = Instant::now();
        let phonemes = kokoro_en::g2p(text, false).expect("phonemization should succeed");
        let phoneme_ms = started.elapsed().as_secs_f64() * 1_000.0;
        let started = Instant::now();
        let tokens = kokoro_en::get_token_ids(&phonemes, false);
        eprintln!(
            "[SIREN COLD] phonemize_ms={:.1} tokenize_ms={:.1} tokens={}",
            phoneme_ms,
            started.elapsed().as_secs_f64() * 1_000.0,
            tokens.len()
        );

        let started = Instant::now();
        let samples = tauri::async_runtime::block_on(engine.synthesize(text, "af_heart", 1.0))
            .expect("first synthesis should succeed");
        eprintln!(
            "[SIREN COLD] first_real_inference_ms={:.1} audio_ms={:.1}",
            started.elapsed().as_secs_f64() * 1_000.0,
            samples.len() as f64 / SAMPLE_RATE as f64 * 1_000.0
        );
    }
}
