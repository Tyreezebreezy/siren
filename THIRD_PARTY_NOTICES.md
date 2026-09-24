# Third-party notices

## Kokoro-82M model and ONNX assets

- Source: https://huggingface.co/hexgrad/Kokoro-82M
- ONNX distribution: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- License: Apache License 2.0
- Local quantized model SHA-256: `FBAE9257E1E05FFC727E951EF9B9C98418E6D79F1C9B6B13BD59F5C9028A1478`
- Local `af_bella` voice SHA-256: `F69D836209B78EB8C66E75E3CDA491E26EA838A3674257E9D4E5703CBAF55C8B`
- Local `af_heart` voice SHA-256: `D583CCFF3CDCA2F7FAE535CB998AC07E9FCB90F09737B9A41FA2734EC44A8F0B`
- Local `am_adam` voice SHA-256: `162B035ED91CFC48B6046982184C645F72EDCDD1B82843347F605D7BF7B15716`
- Local `bf_emma` voice SHA-256: `669FE0647F9DD04FCAB92F1439A40EEB4C8B4AB1F82E4996FE3D918CE4A63B73`

## kokoro-en

- Version: 0.1.5
- Source: https://github.com/pguso/kokoro
- License: Apache License 2.0
- SIREN disables the default bundled eSpeak feature for the initial lean Windows build.

Other Rust and JavaScript dependencies retain their respective licenses as
recorded in `src-tauri/Cargo.lock` and `package-lock.json`.

## PDFium and pdfium-render

- Wrapper: `pdfium-render` 0.9.4, MIT OR Apache-2.0.
- Runtime: PDFium `156.0.8066.0`, distributed by `bblanchon/pdfium-binaries`.
- Source asset: https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/8066/pdfium-win-x64.tgz
- Archive SHA-256: `739A57D597D864297909CC40A2411EBA728490C76A0FA25E3EA299C7F6B07020`
- Bundled `pdfium.dll` SHA-256: `D42C452A4CF8CA19A87E9C659D4E05035BE742C21696AC13431CF73AC1BBF14B`
- Runtime distribution license: MIT; PDFium and bundled components retain the
  licenses shipped with the distribution. SIREN includes PDFium only to render
  user-selected text-poor PDF pages for local OCR.

## Tesseract OCR and English traineddata

- Runtime: Tesseract `5.4.0.20240519`, Apache License 2.0; Leptonica 1.84.1
  and bundled runtime libraries retain their upstream licenses.
- Windows distributor: Universität Mannheim.
- Source installer: https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-5.4.0.20240519-1-ga5ff320e.exe
- Signed installer SHA-256: `A4AA4C1ACE0A423DC8A756E2EE3FE2C7FDF579049BB731AA8613CA74EC19D0F8`
- Bundled `tesseract.exe` SHA-256: `7F37AD29F6FA01F58C53978C12EB1B5DBDF9D32DAEC69CD2E0FE4DA1831BE8F6`
- English model: `tessdata_fast` revision
  `87416418657359cb625c412a48b6e1d6d41c29bd`, Apache License 2.0.
- Bundled `eng.traineddata` SHA-256: `7D4322BD2A7749724879683FC3912CB542F19906C83BCC1A52132556427170B2`
- The exact hashes for every bundled OCR runtime file are recorded in
  `docs/OCR_RUNTIME_SHA256.txt`.
