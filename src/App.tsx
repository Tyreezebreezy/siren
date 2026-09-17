import { invoke } from "@tauri-apps/api/core";
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
  const [editing, setEditing] = useState(!state.activeId);
  const [draftName, setDraftName] = useState("Untitled");
  const [draftText, setDraftText] = useState("");
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const [message, setMessage] = useState("Ready.");
  const [playback, setPlayback] = useState<PlaybackState>("idle");
  const [tts, setTts] = useState<TtsStatus>({
    ready: false,
    voices: ["af_heart"],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        if (status.ready) {
          void invoke("tts_warmup").catch((error) =>
            debugTts({ phase: "warmup-failed", error: String(error) }),
          );
        }
      })
      .catch(() => {
        // Browser-only visual QA has no Tauri command bridge.
      });
  }, []);

  useEffect(() => {
    if (!state.settings.autoScroll || editing) return;
    document.getElementById(`sentence-${currentIndex}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [currentIndex, editing, state.settings.autoScroll]);

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
    setMessage(String(error));
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

  function play() {
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
    if (playback === "playing" || playback === "loading") return;
    const chunks = buildSpeechChunks(reader.sentences, currentIndex);
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
    setPosition(moveSentence(currentIndex, delta, reader.sentences.length));
  }

  function openDocument(document: LibraryDocument) {
    stopPlayback();
    setLibraryExpanded(false);
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
    setDraftName("Untitled");
    setDraftText("");
    setEditing(true);
    setMessage("Type or paste text, then choose Read this text.");
  }

  function editCurrentText() {
    if (!activeDocument) return;
    stopPlayback();
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
        text = await invoke<string>(
          "extract_pdf",
          new Uint8Array(await file.arrayBuffer()),
        );
      } else {
        throw new Error("SIREN supports TXT, Markdown, and PDF files.");
      }

      if (parseReaderDocument(text).sentences.length === 0) {
        throw new Error("This document does not contain readable text.");
      }
      const document: LibraryDocument = {
        id: `${kind}:${file.name}:${file.size}:${file.lastModified}`,
        name: documentTitle(file.name),
        kind,
        text: text.trim(),
        position: 0,
        lastOpenedAt: new Date().toISOString(),
      };
      addDocument(document);
      setEditing(false);
      setMessage(`Opened ${file.name}.`);
    } catch (error) {
      setPlayback("error");
      setMessage(String(error));
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
    <div className={`app-shell${libraryExpanded ? " library-expanded" : ""}`}>
      <header className="app-header">
        <button className="brand" type="button" onClick={beginNewText}>
          <span className="brand-mark" aria-hidden="true">
            <BrandMark />
          </span>
          <span>SIREN</span>
        </button>
        <div className="document-actions">
          <button
            className="library-toggle"
            type="button"
            aria-controls="recent-library"
            aria-expanded={libraryExpanded}
            onClick={() => setLibraryExpanded((expanded) => !expanded)}
          >
            <Icon name="library" />
            Recent
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
            accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
            onChange={importDocument}
          />
        </div>
        <h1 className="document-title">
          {editing ? draftName || "Untitled" : activeDocument?.name || "SIREN"}
        </h1>
        <fieldset className="theme-control">
          <legend>Appearance</legend>
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
      </header>

      <aside
        id="recent-library"
        className="library"
        aria-label="Recent documents"
      >
        <h2>Recent</h2>
        <div className="recent-list">
          {state.documents.length === 0 ? (
            <p className="empty-library">
              Documents you open stay on this device.
            </p>
          ) : (
            state.documents.map((document) => (
              <button
                className={document.id === state.activeId ? "active" : ""}
                type="button"
                key={document.id}
                title={document.name}
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
            ))
          )}
        </div>
        <p className="local-state">
          <span aria-hidden="true" /> Local · Offline
        </p>
      </aside>

      <main className="reader-frame">
        {editing ? (
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
          <article className="reader" aria-label={activeDocument.name}>
            {reader.paragraphs.map((paragraph) => (
              <p key={paragraph.index}>
                {paragraph.sentences.map((sentence) => (
                  <span
                    id={`sentence-${sentence.index}`}
                    className={
                      (highlightRange === null &&
                        sentence.index === currentIndex) ||
                      (highlightRange !== null &&
                        sentence.index >= highlightRange.start &&
                        sentence.index <= highlightRange.end)
                        ? "current"
                        : ""
                    }
                    aria-current={
                      sentence.index === currentIndex ? "true" : undefined
                    }
                    key={sentence.index}
                  >
                    {sentence.text}{" "}
                  </span>
                ))}
              </p>
            ))}
          </article>
        ) : (
          <section className="empty-reader">
            <h2>Your local reading space</h2>
            <p>
              Type text or open a TXT, Markdown, or text-based PDF document.
            </p>
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
    </div>
  );
}

function debugTts(details: Record<string, unknown>) {
  if (import.meta.env.DEV) console.debug("[SIREN TTS]", details);
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
