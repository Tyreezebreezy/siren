import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import {
  buildSpeechChunks,
  documentTitle,
  markdownToReadableText,
  moveSentence,
  parseReaderDocument,
  type DocumentKind,
  type SpeechChunk,
} from "./reader";
import { SessionBuffer } from "./playback";
import {
  loadState,
  saveState,
  type LibraryDocument,
  type PersistedState,
} from "./persistence";
import { resolveTheme, type ThemePreference } from "./theme";

type PlaybackState =
  "idle" | "loading" | "playing" | "paused" | "stopped" | "ended" | "error";

type TtsStatus = {
  ready: boolean;
  voices: string[];
};

type PdfInspection = {
  pages: string[];
  ocrPages: number[];
};

type OcrDocument = {
  pages: string[];
  ocrPageCount: number;
};

type OcrProgress = {
  currentPage: number;
  totalPages: number;
  phase: string;
};

type PendingPdf = {
  id: string;
  fileName: string;
  name: string;
  pageCount: number;
  ocrPageCount: number;
};

type SpeechUnitState =
  | "queued"
  | "generating"
  | "ready"
  | "playing"
  | "completed"
  | "cancelled"
  | "failed";

type SpeechUnit = {
  chunk: SpeechChunk;
  state: SpeechUnitState;
};

type BufferedSpeech = {
  unit: SpeechUnit;
  wav: ArrayBuffer;
  audioMs: number;
  synthesisMs: number;
};

type PlaybackMetrics = {
  synthesisMs: number[];
  transitionMs: number[];
  underruns: number;
};

const themeOptions: ThemePreference[] = ["system", "light", "dark"];
const wavSampleRate = 24_000;
const readyBufferSize = 3;

function App() {
  const [state, setState] = useState<PersistedState>(loadState);
  const [surface, setSurface] = useState<"library" | "reader">(
    state.activeId ? "reader" : "library",
  );
  const [editing, setEditing] = useState(!state.activeId);
  const [draftName, setDraftName] = useState("Untitled");
  const [draftText, setDraftText] = useState("");
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [followCurrent, setFollowCurrent] = useState(true);
  const [message, setMessage] = useState("Ready.");
  const [playback, setPlayback] = useState<PlaybackState>("idle");
  const [tts, setTts] = useState<TtsStatus>({
    ready: false,
    voices: ["af_heart"],
  });
  const [pendingPdf, setPendingPdf] = useState<PendingPdf | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPdfBytesRef = useRef<Uint8Array | null>(null);
  const ocrRequestRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const bufferRef = useRef<SessionBuffer<BufferedSpeech> | null>(null);
  const playbackBuffer = (bufferRef.current ??= new SessionBuffer(
    readyBufferSize,
  ));
  const speechUnitsRef = useRef<SpeechUnit[]>([]);
  const nextSpeechUnitRef = useRef(0);
  const producerSessionRef = useRef<number | null>(null);
  const metricsRef = useRef<PlaybackMetrics>({
    synthesisMs: [],
    transitionMs: [],
    underruns: 0,
  });
  const playbackStartedAtRef = useRef<number | null>(null);
  const previousAudioEndedAtRef = useRef<number | null>(null);
  const underrunStartedAtRef = useRef<number | null>(null);
  const [highlightRange, setHighlightRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const activeDocument =
    state.documents.find(({ id }) => id === state.activeId) ?? null;
  const reader = useMemo(
    () => parseReaderDocument(activeDocument?.text ?? ""),
    [activeDocument?.text],
  );
  const contents = useMemo(
    () =>
      activeDocument?.pages
        ? pageContents(activeDocument.pages)
        : reader.paragraphs.map((paragraph) => ({
            index: paragraph.index,
            start: paragraph.sentences[0]?.index ?? 0,
            label: `Passage ${paragraph.index + 1}`,
            preview: paragraph.sentences
              .map(({ text }) => text)
              .join(" ")
              .slice(0, 58),
          })),
    [activeDocument?.pages, reader.paragraphs],
  );
  const currentIndex = Math.min(
    activeDocument?.position ?? 0,
    Math.max(0, reader.sentences.length - 1),
  );

  useEffect(() => {
    if (!saveState(state)) {
      setMessage("SIREN could not save reading progress on this device.");
    }
  }, [state]);

  useEffect(() => {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme = resolveTheme(
        state.settings.theme,
        systemDark.matches,
      );
    };
    applyTheme();
    if (state.settings.theme === "system") {
      systemDark.addEventListener("change", applyTheme);
      return () => systemDark.removeEventListener("change", applyTheme);
    }
  }, [state.settings.theme]);

  useEffect(() => {
    invoke<TtsStatus>("tts_status")
      .then((status) => {
        setTts(status);
        if (status.voices.length > 0) {
          setState((current) => ({
            ...current,
            settings: {
              ...current.settings,
              voice: status.voices.includes(current.settings.voice)
                ? current.settings.voice
                : status.voices[0],
            },
          }));
        }
      })
      .catch(() => {
        // Browser-only visual QA has no Tauri command bridge.
      });
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<OcrProgress>("ocr-progress", ({ payload }) =>
      setOcrProgress(payload),
    )
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {
        // Browser-only visual QA has no Tauri event bridge.
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (
      !state.settings.autoScroll ||
      !followCurrent ||
      editing ||
      surface !== "reader"
    )
      return;
    document.getElementById(`sentence-${currentIndex}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [
    currentIndex,
    editing,
    followCurrent,
    state.settings.autoScroll,
    surface,
  ]);

  useEffect(
    () => () => {
      playbackBuffer.cancel();
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  function updateSettings(patch: Partial<PersistedState["settings"]>) {
    if ("voice" in patch || "speed" in patch) stopPlayback();
    setState((current) => ({
      ...current,
      settings: { ...current.settings, ...patch },
    }));
  }

  function setPosition(position: number) {
    if (!activeDocument) return;
    setState((current) => ({
      ...current,
      documents: current.documents.map((document) =>
        document.id === activeDocument.id
          ? { ...document, position }
          : document,
      ),
    }));
  }

  function releaseAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }

  function stopPlayback() {
    const cancelled = speechUnitsRef.current.filter(
      ({ state }) => state !== "completed" && state !== "failed",
    );
    for (const unit of cancelled) unit.state = "cancelled";
    playbackBuffer.cancel();
    producerSessionRef.current = null;
    speechUnitsRef.current = [];
    nextSpeechUnitRef.current = 0;
    releaseAudio();
    playbackStartedAtRef.current = null;
    previousAudioEndedAtRef.current = null;
    underrunStartedAtRef.current = null;
    setHighlightRange(null);
    if (cancelled.length > 0) {
      debugTts({ phase: "session-cancelled", units: cancelled.length });
    }
    setPlayback("stopped");
    setMessage("Stopped. Ready to resume.");
  }

  function failPlayback(session: number, unit: SpeechUnit, error: unknown) {
    if (!playbackBuffer.isCurrent(session)) return;
    unit.state = "failed";
    playbackBuffer.cancel();
    producerSessionRef.current = null;
    releaseAudio();
    setHighlightRange(null);
    setPlayback("error");
    setMessage(userMessage(error));
    debugTts({
      phase: "failed",
      chunkIndex: unit.chunk.index,
      error: String(error),
    });
  }

  function finishPlayback(unit: SpeechUnit) {
    unit.state = "completed";
    setPosition(unit.chunk.endSentence);
    setHighlightRange(null);
    setPlayback("ended");
    setMessage("End of document.");
    const transitions = metricsRef.current.transitionMs;
    debugTts({
      phase: "session-summary",
      averageTransitionMs:
        transitions.length === 0
          ? null
          : Math.round(
              transitions.reduce((total, value) => total + value, 0) /
                transitions.length,
            ),
      worstTransitionMs:
        transitions.length === 0 ? null : Math.round(Math.max(...transitions)),
      bufferUnderruns: metricsRef.current.underruns,
      averageSynthesisMs: Math.round(
        metricsRef.current.synthesisMs.reduce(
          (total, value) => total + value,
          0,
        ) / Math.max(1, metricsRef.current.synthesisMs.length),
      ),
    });
  }

  async function playNextReady(session: number, voice: string, speed: number) {
    if (!playbackBuffer.isCurrent(session) || audioRef.current) return;
    const buffered = playbackBuffer.dequeue(session);
    if (!buffered) {
      if (
        nextSpeechUnitRef.current < speechUnitsRef.current.length ||
        producerSessionRef.current === session
      ) {
        if (
          previousAudioEndedAtRef.current !== null &&
          underrunStartedAtRef.current === null
        ) {
          underrunStartedAtRef.current = performance.now();
          metricsRef.current.underruns += 1;
        }
        setPlayback("loading");
        setMessage("Buffering locally…");
        void fillBuffer(session, voice, speed);
      }
      return;
    }

    const { unit, wav } = buffered;
    unit.state = "playing";
    setPosition(unit.chunk.startSentence);
    setHighlightRange({
      start: unit.chunk.startSentence,
      end: unit.chunk.endSentence,
    });
    releaseAudio();
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    const audio = new Audio(url);
    audioRef.current = audio;
    audioUrlRef.current = url;
    audio.addEventListener(
      "ended",
      () => {
        if (!playbackBuffer.isCurrent(session)) return;
        unit.state = "completed";
        previousAudioEndedAtRef.current = performance.now();
        releaseAudio();
        if (unit.chunk.endSentence >= reader.sentences.length - 1) {
          finishPlayback(unit);
          return;
        }
        void playNextReady(session, voice, speed);
        void fillBuffer(session, voice, speed);
      },
      { once: true },
    );
    audio.addEventListener(
      "error",
      () =>
        failPlayback(
          session,
          unit,
          "Windows could not play the synthesized audio.",
        ),
      { once: true },
    );

    try {
      await audio.play();
      if (!playbackBuffer.isCurrent(session)) return;
      const now = performance.now();
      const transitionMs =
        previousAudioEndedAtRef.current === null
          ? null
          : now - previousAudioEndedAtRef.current;
      if (transitionMs !== null) {
        metricsRef.current.transitionMs.push(transitionMs);
      }
      underrunStartedAtRef.current = null;
      debugTts({
        phase: "playing",
        chunkIndex: unit.chunk.index,
        sentenceIndexes: [unit.chunk.startSentence, unit.chunk.endSentence],
        playbackStartLatencyMs:
          playbackStartedAtRef.current === null
            ? null
            : Math.round(now - playbackStartedAtRef.current),
        transitionDelayMs:
          transitionMs === null ? null : Math.round(transitionMs),
        queueDepth: playbackBuffer.size,
        readyUnits: playbackBuffer.size,
        generating: producerSessionRef.current === session,
      });
      setPlayback("playing");
      setMessage("Reading locally.");
    } catch (error) {
      failPlayback(session, unit, error);
    }
  }

  async function fillBuffer(session: number, voice: string, speed: number) {
    if (
      !playbackBuffer.isCurrent(session) ||
      producerSessionRef.current === session
    ) {
      return;
    }
    producerSessionRef.current = session;
    try {
      while (
        playbackBuffer.isCurrent(session) &&
        playbackBuffer.size < playbackBuffer.capacity &&
        nextSpeechUnitRef.current < speechUnitsRef.current.length
      ) {
        const unit = speechUnitsRef.current[nextSpeechUnitRef.current++];
        unit.state = "generating";
        const synthesisStartedAt = performance.now();
        debugTts({
          phase: "generating",
          chunkIndex: unit.chunk.index,
          sentenceIndexes: [unit.chunk.startSentence, unit.chunk.endSentence],
          characters: unit.chunk.text.length,
          queueDepth: playbackBuffer.size,
          readyUnits: playbackBuffer.size,
          generating: true,
        });
        let wav: ArrayBuffer;
        try {
          wav = await invoke<ArrayBuffer>("tts_synthesize", {
            text: unit.chunk.text,
            voice,
            speed,
          });
        } catch (error) {
          failPlayback(session, unit, error);
          return;
        }
        if (!playbackBuffer.isCurrent(session)) {
          unit.state = "cancelled";
          return;
        }
        const synthesisMs = performance.now() - synthesisStartedAt;
        const audioMs =
          (Math.max(0, wav.byteLength - 44) / (wavSampleRate * 2)) * 1_000;
        metricsRef.current.synthesisMs.push(synthesisMs);
        unit.state = "ready";
        if (
          !playbackBuffer.enqueue(session, {
            unit,
            wav,
            audioMs,
            synthesisMs,
          })
        ) {
          unit.state = "cancelled";
          return;
        }
        debugTts({
          phase: "ready",
          chunkIndex: unit.chunk.index,
          sentenceIndexes: [unit.chunk.startSentence, unit.chunk.endSentence],
          characters: unit.chunk.text.length,
          synthesisMs: Math.round(synthesisMs),
          audioMs: Math.round(audioMs),
          rtf: Number((synthesisMs / Math.max(audioMs, 1)).toFixed(3)),
          queueDepth: playbackBuffer.size,
          readyUnits: playbackBuffer.size,
          generating: false,
        });
        if (!audioRef.current) {
          await playNextReady(session, voice, speed);
        }
      }
    } finally {
      if (producerSessionRef.current === session) {
        producerSessionRef.current = null;
      }
    }
  }

  function play(startIndex = currentIndex, restart = false) {
    if (!activeDocument || reader.sentences.length === 0) {
      setMessage("Enter or open text before playing it.");
      return;
    }
    if (playback === "paused" && audioRef.current) {
      void audioRef.current.play().then(() => {
        setPlayback("playing");
        setMessage("Reading locally.");
      });
      return;
    }
    if (!restart && (playback === "playing" || playback === "loading")) return;
    const chunks = buildSpeechChunks(reader.sentences, startIndex);
    if (chunks.length === 0) return;
    const session = playbackBuffer.begin();
    speechUnitsRef.current = chunks.map((chunk) => ({
      chunk,
      state: "queued",
    }));
    nextSpeechUnitRef.current = 0;
    metricsRef.current = { synthesisMs: [], transitionMs: [], underruns: 0 };
    playbackStartedAtRef.current = performance.now();
    previousAudioEndedAtRef.current = null;
    underrunStartedAtRef.current = null;
    setPlayback("loading");
    setMessage("Preparing local speech…");
    debugTts({
      phase: "session-start",
      session,
      chunks: chunks.length,
      readyTarget: playbackBuffer.capacity,
      voice: state.settings.voice,
      speed: state.settings.speed,
    });
    void fillBuffer(session, state.settings.voice, state.settings.speed);
  }

  function pause() {
    if (playback !== "playing" || !audioRef.current) return;
    audioRef.current.pause();
    setPlayback("paused");
    setMessage("Paused. Your sentence position is saved.");
  }

  function move(delta: number) {
    stopPlayback();
    setFollowCurrent(true);
    setPosition(moveSentence(currentIndex, delta, reader.sentences.length));
  }

  function jumpToSentence(index: number) {
    const resume = playback === "playing" || playback === "loading";
    stopPlayback();
    setPosition(index);
    setFollowCurrent(true);
    if (resume) window.setTimeout(() => play(index, true), 0);
  }

  function returnToCurrent() {
    setFollowCurrent(true);
    requestAnimationFrame(() =>
      document.getElementById(`sentence-${currentIndex}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      }),
    );
  }

  function yieldFollow() {
    if (
      state.settings.autoScroll &&
      (playback === "playing" || playback === "loading")
    ) {
      setFollowCurrent(false);
    }
  }

  function showLibrary() {
    stopPlayback();
    setAppearanceOpen(false);
    setSurface("library");
  }

  function openDocument(document: LibraryDocument) {
    stopPlayback();
    setLibraryExpanded(false);
    setFollowCurrent(true);
    setSurface("reader");
    setEditing(false);
    setState((current) => ({
      ...current,
      activeId: document.id,
      documents: current.documents.map((item) =>
        item.id === document.id
          ? { ...item, lastOpenedAt: new Date().toISOString() }
          : item,
      ),
    }));
    setMessage(`Opened ${document.name}.`);
  }

  function beginNewText() {
    stopPlayback();
    setSurface("reader");
    setDraftName("Untitled");
    setDraftText("");
    setEditing(true);
    setMessage("Type or paste text, then choose Read this text.");
  }

  function editCurrentText() {
    if (!activeDocument) return;
    stopPlayback();
    setSurface("reader");
    setDraftName(activeDocument.name);
    setDraftText(activeDocument.text);
    setEditing(true);
  }

  function saveDraft() {
    const text = draftText.trim();
    if (parseReaderDocument(text).sentences.length === 0) {
      setMessage("Enter readable text before starting the reader.");
      return;
    }
    const id =
      activeDocument && draftName === activeDocument.name
        ? activeDocument.id
        : `text:${Date.now()}`;
    addDocument({
      id,
      name: draftName.trim() || "Untitled",
      kind: "text",
      text,
      position: 0,
      lastOpenedAt: new Date().toISOString(),
    });
    setEditing(false);
    setMessage("Text is ready to read.");
  }

  function addDocument(document: LibraryDocument) {
    setSurface("reader");
    setState((current) => ({
      ...current,
      activeId: document.id,
      documents: [
        document,
        ...current.documents.filter(({ id }) => id !== document.id),
      ].slice(0, 8),
    }));
  }

  async function importDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    stopPlayback();
    setMessage(`Opening ${file.name}…`);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      let kind: DocumentKind;
      let text: string;
      let id = `${extension}:${file.name}:${file.size}:${file.lastModified}`;
      let pages: string[] | undefined;
      if (extension === "txt") {
        kind = "txt";
        text = await file.text();
      } else if (extension === "md" || extension === "markdown") {
        kind = "markdown";
        text = markdownToReadableText(await file.text());
      } else if (extension === "pdf") {
        if (file.size > 50 * 1024 * 1024) {
          throw new Error("PDF files must be 50 MB or smaller.");
        }
        kind = "pdf";
        const bytes = new Uint8Array(await file.arrayBuffer());
        id = await pdfCacheId(bytes);
        const cached = state.documents.find((document) => document.id === id);
        if (cached) {
          openDocument(cached);
          setMessage(`Opened cached text for ${file.name}.`);
          return;
        }
        const inspection = await invoke<PdfInspection>("inspect_pdf", bytes);
        pages = inspection.pages;
        if (inspection.ocrPages.length > 0) {
          pendingPdfBytesRef.current = bytes;
          setPendingPdf({
            id,
            fileName: file.name,
            name: documentTitle(file.name),
            pageCount: pages.length,
            ocrPageCount: inspection.ocrPages.length,
          });
          setOcrProgress(null);
          setOcrError("");
          setPlayback("idle");
          setMessage("OCR approval required.");
          return;
        }
        text = readablePages(pages);
      } else {
        throw new Error("SIREN supports TXT, Markdown, and PDF files.");
      }

      if (parseReaderDocument(text).sentences.length === 0) {
        throw new Error("This document does not contain readable text.");
      }
      const document: LibraryDocument = {
        id,
        name: documentTitle(file.name),
        kind,
        text: text.trim(),
        position: 0,
        lastOpenedAt: new Date().toISOString(),
        pages,
      };
      addDocument(document);
      setEditing(false);
      setMessage(`Opened ${file.name}.`);
    } catch (error) {
      setPlayback("error");
      setMessage(userMessage(error));
    }
  }

  async function runOcr() {
    if (!pendingPdf || !pendingPdfBytesRef.current || ocrRunning) return;
    const request = ++ocrRequestRef.current;
    setOcrRunning(true);
    setOcrError("");
    setOcrProgress({
      currentPage: 0,
      totalPages: pendingPdf.pageCount,
      phase: "Starting local OCR",
    });
    setMessage(`Reading ${pendingPdf.fileName} locally…`);
    try {
      const result = await invoke<OcrDocument>(
        "ocr_pdf",
        pendingPdfBytesRef.current,
      );
      if (request !== ocrRequestRef.current) return;
      const text = readablePages(result.pages);
      if (parseReaderDocument(text).sentences.length === 0) {
        throw new Error("OCR finished, but no readable text was found.");
      }
      addDocument({
        id: pendingPdf.id,
        name: pendingPdf.name,
        kind: "pdf",
        text,
        pages: result.pages,
        ocr: result.ocrPageCount > 0,
        position: 0,
        lastOpenedAt: new Date().toISOString(),
      });
      setEditing(false);
      setPendingPdf(null);
      pendingPdfBytesRef.current = null;
      setMessage(`Opened ${pendingPdf.fileName} with local OCR.`);
    } catch (error) {
      if (request !== ocrRequestRef.current) return;
      setOcrError(userMessage(error));
      setMessage("OCR did not complete. Retry or cancel.");
    } finally {
      if (request === ocrRequestRef.current) setOcrRunning(false);
    }
  }

  function cancelOcr() {
    ocrRequestRef.current += 1;
    if (ocrRunning) void invoke("cancel_ocr").catch(() => undefined);
    setOcrRunning(false);
    setPendingPdf(null);
    setOcrProgress(null);
    setOcrError("");
    pendingPdfBytesRef.current = null;
    setMessage("OCR cancelled. The source PDF was not changed.");
  }

  function clearOcrCache() {
    stopPlayback();
    setState((current) => {
      const removedActive = current.documents.some(
        (document) => document.id === current.activeId && document.ocr,
      );
      return {
        ...current,
        activeId: removedActive ? null : current.activeId,
        documents: current.documents.filter((document) => !document.ocr),
      };
    });
    if (activeDocument?.ocr) setSurface("library");
    setMessage("Cached OCR text was cleared. Source PDFs were not changed.");
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "o") {
        event.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if (command && event.key === ",") {
        event.preventDefault();
        setAppearanceOpen((open) => !open);
        return;
      }
      if (event.key === "Escape" && pendingPdf) {
        cancelOcr();
        return;
      }
      if (event.key === "Escape" && appearanceOpen) {
        setAppearanceOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select") ||
        target?.isContentEditable ||
        editing
      ) {
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        playback === "playing" ? pause() : play();
      } else if (event.key === "Escape") {
        stopPlayback();
      } else if (event.key === "ArrowLeft") {
        move(-1);
      } else if (event.key === "ArrowRight") {
        move(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const progress =
    reader.sentences.length === 0
      ? 0
      : ((currentIndex + 1) / reader.sentences.length) * 100;
  const primaryAction = playback === "playing" ? pause : play;
  const primaryLabel =
    playback === "playing"
      ? "Pause"
      : playback === "paused"
        ? "Resume"
        : "Play";

  return (
    <div
      className={`app-shell ${surface}-view${libraryExpanded ? " library-expanded" : ""}`}
      data-text-size={state.settings.textSize}
      data-line-spacing={state.settings.lineSpacing}
      data-reader-width={state.settings.readerWidth}
    >
      <header className="app-header">
        <button
          className="brand"
          type="button"
          onClick={showLibrary}
          aria-label="Open Library"
        >
          <span className="brand-mark" aria-hidden="true">
            <BrandMark />
          </span>
          <span>SIREN</span>
        </button>
        <div className="document-actions">
          {surface === "reader" ? (
            <button type="button" onClick={showLibrary}>
              <Icon name="library" />
              Library
            </button>
          ) : null}
          <button
            className="library-toggle"
            type="button"
            aria-controls="recent-library"
            aria-expanded={libraryExpanded}
            onClick={() => setLibraryExpanded((expanded) => !expanded)}
          >
            <Icon name="library" />
            Contents
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            <Icon name="folder" />
            Open document
          </button>
          <button type="button" onClick={beginNewText}>
            <Icon name="plus" />
            New text
          </button>
          {activeDocument ? (
            <button type="button" onClick={editCurrentText}>
              Edit text
            </button>
          ) : null}
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            aria-label="Choose document file"
            accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
            onChange={importDocument}
          />
        </div>
        <h1 className="document-title">
          {editing ? draftName || "Untitled" : activeDocument?.name || "SIREN"}
        </h1>
        <div className="appearance">
          <button
            type="button"
            aria-controls="appearance-panel"
            aria-expanded={appearanceOpen}
            onClick={() => setAppearanceOpen((open) => !open)}
          >
            Appearance
          </button>
          {appearanceOpen ? (
            <div id="appearance-panel" className="appearance-panel">
              <fieldset className="theme-control">
                <legend>Theme</legend>
                {themeOptions.map((theme) => (
                  <label key={theme}>
                    <input
                      type="radio"
                      name="theme"
                      value={theme}
                      checked={state.settings.theme === theme}
                      onChange={() => updateSettings({ theme })}
                    />
                    <span>{theme[0].toUpperCase() + theme.slice(1)}</span>
                  </label>
                ))}
              </fieldset>
              <label>
                <span>Text size</span>
                <select
                  value={state.settings.textSize}
                  onChange={(event) =>
                    updateSettings({
                      textSize: event.target
                        .value as PersistedState["settings"]["textSize"],
                    })
                  }
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </label>
              <label>
                <span>Line spacing</span>
                <select
                  value={state.settings.lineSpacing}
                  onChange={(event) =>
                    updateSettings({
                      lineSpacing: event.target
                        .value as PersistedState["settings"]["lineSpacing"],
                    })
                  }
                >
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                  <option value="relaxed">Relaxed</option>
                </select>
              </label>
              <label>
                <span>Reader width</span>
                <select
                  value={state.settings.readerWidth}
                  onChange={(event) =>
                    updateSettings({
                      readerWidth: event.target
                        .value as PersistedState["settings"]["readerWidth"],
                    })
                  }
                >
                  <option value="narrow">Narrow</option>
                  <option value="comfortable">Comfortable</option>
                  <option value="wide">Wide</option>
                </select>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={state.settings.highlighting}
                  onChange={(event) =>
                    updateSettings({ highlighting: event.target.checked })
                  }
                />
                <span aria-hidden="true" />
                Highlight current text
              </label>
              {state.documents.some((document) => document.ocr) ? (
                <button
                  className="clear-ocr"
                  type="button"
                  onClick={clearOcrCache}
                >
                  Clear cached OCR text
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <aside
        id="recent-library"
        className="library"
        aria-label="Document contents"
      >
        <h2>Contents</h2>
        <div className="recent-list">
          {!activeDocument ? (
            <p className="empty-library">
              Open a document to view its passages.
            </p>
          ) : (
            contents.map((entry) => {
              const next =
                contents[entry.index + 1]?.start ?? reader.sentences.length;
              const active = currentIndex >= entry.start && currentIndex < next;
              return (
                <button
                  className={active ? "active" : ""}
                  type="button"
                  key={entry.index}
                  aria-current={active ? "true" : undefined}
                  onClick={() => jumpToSentence(entry.start)}
                  aria-label={`${entry.label}: ${entry.preview}`}
                >
                  <Icon name="document" />
                  <span>
                    <strong>{entry.label}</strong>
                    <small>
                      {entry.preview}
                      {entry.preview.length === 58 ? "…" : ""}
                    </small>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <p className="local-state">
          <span aria-hidden="true" /> Local · Offline
        </p>
      </aside>

      <main
        className="reader-frame"
        onWheel={yieldFollow}
        onTouchStart={yieldFollow}
      >
        {surface === "library" ? (
          <section className="library-home" aria-labelledby="library-heading">
            <p className="eyebrow">Private · Local · Offline</p>
            <h2 id="library-heading">Listen to your documents.</h2>
            <p className="library-intro">
              Open a file or paste text. SIREN keeps your reading and progress
              on this device.
            </p>
            <div className="library-actions">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="folder" />
                Open document
              </button>
              <button type="button" onClick={beginNewText}>
                <Icon name="plus" />
                New text
              </button>
            </div>
            {editing && draftText.trim() ? (
              <button
                className="continue-card"
                type="button"
                onClick={() => setSurface("reader")}
              >
                <span>Continue draft</span>
                <strong>{draftName || "Untitled"}</strong>
                <small>
                  {draftText.trim().length.toLocaleString()} characters
                </small>
              </button>
            ) : activeDocument ? (
              <button
                className="continue-card"
                type="button"
                onClick={() => openDocument(activeDocument)}
              >
                <span>Continue listening</span>
                <strong>{activeDocument.name}</strong>
                <small>
                  Sentence {currentIndex + 1} of {reader.sentences.length}
                </small>
              </button>
            ) : null}
            <div className="library-section">
              <h3>Recent</h3>
              {state.documents.length === 0 ? (
                <p>No documents yet. Open one to begin.</p>
              ) : (
                <div className="library-grid">
                  {state.documents.map((document) => (
                    <button
                      type="button"
                      key={document.id}
                      onClick={() => openDocument(document)}
                    >
                      <Icon name="document" />
                      <span>
                        <strong>{document.name}</strong>
                        <small>
                          {document.kind.toUpperCase()} · Sentence{" "}
                          {document.position + 1}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : editing ? (
          <section className="editor" aria-labelledby="editor-heading">
            <div className="editor-heading">
              <div>
                <p>Type or paste</p>
                <h2 id="editor-heading">Create a reading</h2>
              </div>
              <input
                aria-label="Document title"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </div>
            <textarea
              autoFocus
              rows={6}
              aria-label="Text to read"
              placeholder="Paste an article, notes, or any text you want SIREN to read aloud…"
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
            />
            <div className="editor-footer">
              <span>{draftText.trim().length.toLocaleString()} characters</span>
              <button type="button" onClick={saveDraft}>
                Read this text
              </button>
            </div>
          </section>
        ) : activeDocument ? (
          <>
            {!followCurrent && state.settings.autoScroll ? (
              <button
                className="return-current"
                type="button"
                onClick={returnToCurrent}
              >
                Return to current
              </button>
            ) : null}
            <article className="reader" aria-label={activeDocument.name}>
              {reader.paragraphs.map((paragraph) => (
                <p key={paragraph.index}>
                  {paragraph.sentences.map((sentence) => (
                    <button
                      type="button"
                      id={`sentence-${sentence.index}`}
                      className={`sentence${
                        state.settings.highlighting &&
                        ((highlightRange === null &&
                          sentence.index === currentIndex) ||
                          (highlightRange !== null &&
                            sentence.index >= highlightRange.start &&
                            sentence.index <= highlightRange.end))
                          ? " current"
                          : ""
                      }`}
                      aria-current={
                        sentence.index === currentIndex ? "true" : undefined
                      }
                      onClick={() => jumpToSentence(sentence.index)}
                      key={sentence.index}
                    >
                      {sentence.text}{" "}
                    </button>
                  ))}
                </p>
              ))}
            </article>
          </>
        ) : (
          <section className="empty-reader">
            <h2>Your local reading space</h2>
            <p>Type text or open a TXT, Markdown, or PDF document.</p>
            <button type="button" onClick={beginNewText}>
              Start with text
            </button>
          </section>
        )}
      </main>

      <footer className="playback-bar">
        <div className="transport">
          <ControlButton
            label="Previous sentence"
            icon="previous"
            disabled={reader.sentences.length === 0 || currentIndex === 0}
            onClick={() => move(-1)}
          />
          <ControlButton
            className="primary-control"
            label={primaryLabel}
            icon={playback === "playing" ? "pause" : "play"}
            disabled={
              reader.sentences.length === 0 || editing || playback === "loading"
            }
            onClick={primaryAction}
          />
          <ControlButton
            label="Stop"
            icon="stop"
            disabled={reader.sentences.length === 0}
            onClick={stopPlayback}
          />
          <ControlButton
            label="Next sentence"
            icon="next"
            disabled={
              reader.sentences.length === 0 ||
              currentIndex >= reader.sentences.length - 1
            }
            onClick={() => move(1)}
          />
        </div>

        <div className="progress" aria-label="Reading progress">
          <span>
            {reader.sentences.length === 0
              ? "No reading loaded"
              : `Sentence ${currentIndex + 1} of ${reader.sentences.length}`}
          </span>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <small role="status">{message}</small>
        </div>

        <div className="reading-settings">
          <label>
            <span>Voice</span>
            <select
              value={state.settings.voice}
              onChange={(event) =>
                updateSettings({ voice: event.target.value })
              }
              disabled={!tts.ready}
            >
              {tts.voices.map((voice) => (
                <option key={voice} value={voice}>
                  {voiceName(voice)}
                </option>
              ))}
            </select>
          </label>
          <label className="speed-control">
            <span>Speed</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={state.settings.speed}
              onChange={(event) =>
                updateSettings({ speed: Number(event.target.value) })
              }
            />
            <output>
              {state.settings.speed.toFixed(2).replace(/0$/, "")}×
            </output>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={state.settings.autoScroll}
              onChange={(event) =>
                updateSettings({ autoScroll: event.target.checked })
              }
            />
            <span aria-hidden="true" />
            Auto-scroll
          </label>
        </div>
      </footer>
      {pendingPdf ? (
        <div className="modal-backdrop">
          <section
            className="ocr-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ocr-heading"
            aria-describedby="ocr-description"
          >
            <p className="eyebrow">Private · Local · Offline</p>
            <h2 id="ocr-heading">
              {ocrRunning
                ? "Reading scanned pages"
                : pendingPdf.ocrPageCount === pendingPdf.pageCount
                  ? "Scanned PDF detected"
                  : "Some pages need OCR"}
            </h2>
            <p id="ocr-description">
              {ocrRunning
                ? `${ocrProgress?.phase ?? "Starting local OCR"}. Page ${ocrProgress?.currentPage ?? 0} of ${ocrProgress?.totalPages ?? pendingPdf.pageCount}.`
                : `${pendingPdf.ocrPageCount} of ${pendingPdf.pageCount} pages need local English OCR. SIREN will not upload or modify the source PDF.`}
            </p>
            {ocrRunning ? (
              <progress
                aria-label="OCR progress"
                max={ocrProgress?.totalPages ?? pendingPdf.pageCount}
                value={ocrProgress?.currentPage ?? 0}
              />
            ) : null}
            {ocrError ? (
              <p className="ocr-error" role="alert">
                {ocrError}
              </p>
            ) : null}
            <div className="ocr-actions">
              <button type="button" onClick={cancelOcr}>
                Cancel
              </button>
              {!ocrRunning ? (
                <button
                  className="primary"
                  type="button"
                  autoFocus
                  onClick={runOcr}
                >
                  {ocrError ? "Retry OCR" : "Run local OCR"}
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function debugTts(details: Record<string, unknown>) {
  if (import.meta.env.DEV) console.debug("[SIREN TTS]", details);
}

function userMessage(error: unknown) {
  return String(error).replace(/^Error:\s*/, "");
}

function readablePages(pages: string[]) {
  return pages
    .filter((page) => page.trim())
    .join("\n\n")
    .trim();
}

async function pdfCacheId(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `pdf:${hash}:ocr-tesseract-5.4-engfast-7d4322bd-2400-v1`;
}

function pageContents(pages: string[]) {
  let start = 0;
  return pages.map((page, index) => {
    const parsed = parseReaderDocument(page);
    const entry = {
      index,
      start,
      label: `Page ${index + 1}`,
      preview: parsed.sentences
        .map(({ text }) => text)
        .join(" ")
        .slice(0, 58),
    };
    start += parsed.sentences.length;
    return entry;
  });
}

function ControlButton({
  className = "",
  disabled,
  icon,
  label,
  onClick,
}: {
  className?: string;
  disabled: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={className}
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      title={label}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

type IconName =
  | "document"
  | "folder"
  | "library"
  | "next"
  | "pause"
  | "play"
  | "plus"
  | "previous"
  | "stop";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    document: <path d="M6 3h7l5 5v13H6zM13 3v5h5M9 13h6M9 17h6" />,
    folder: <path d="M3 7h7l2 2h9l-2 10H4zM3 7V5h7l2 2" />,
    library: <path d="M4 5h16v14H4zM8 5v14M11 9h6M11 13h6" />,
    next: <path d="m5 5 9 7-9 7zM17 5v14" />,
    pause: <path d="M7 5h3v14H7zM14 5h3v14h-3z" />,
    play: <path d="m8 5 11 7-11 7z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    previous: <path d="m19 5-9 7 9 7zM7 5v14" />,
    stop: <path d="M6 6h12v12H6z" />,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" />
      <path d="M23.5 7.5h-9c-3.4 0-5.8 2-5.8 4.7s2.4 4.7 5.8 4.7h3c3.4 0 5.8 2 5.8 4.7s-2.4 4.7-5.8 4.7h-9" />
    </svg>
  );
}

function voiceName(voice: string) {
  const parts = voice.split("_");
  const name = parts[parts.length - 1] || voice;
  return name[0].toUpperCase() + name.slice(1);
}

export default App;
