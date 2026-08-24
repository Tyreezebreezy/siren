use kokoro_en::{KokoroTts, Voice};
use std::{
    fs,
    path::{Path, PathBuf},
};
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

        let mut engine = self.engine.lock().await;
        if engine.is_none() {
            *engine = Some(TtsEngine::load(&self.assets).await?);
        }

        let samples = engine
            .as_ref()
            .expect("engine initialized above")
            .synthesize(text, voice, speed)
            .await?;
        Ok(wav_from_samples(&samples))
    }
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
        return Err("SIREN synthesizes one sentence at a time.".into());
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
}
