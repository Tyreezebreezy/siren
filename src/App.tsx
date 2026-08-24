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
  documentTitle,
  markdownToReadableText,
  moveSentence,
  parseReaderDocument,
  type DocumentKind,
} from "./reader";
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

const themeOptions: ThemePreference[] = ["system", "light", "dark"];

function App() {
  const [state, setState] = useState<PersistedState>(loadState);
  const [editing, setEditing] = useState(!state.activeId);
  const [draftName, setDraftName] = useState("Untitled");
  const [draftText, setDraftText] = useState("");
  const [message, setMessage] = useState("Ready.");
  const [playback, setPlayback] = useState<PlaybackState>("idle");
  const [tts, setTts] = useState<TtsStatus>({
    ready: false,
    voices: ["af_heart"],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

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
      requestIdRef.current += 1;
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  function updateSettings(patch: Partial<PersistedState["settings"]>) {
    stopPlayback();
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
    requestIdRef.current += 1;
    releaseAudio();
    setPlayback("stopped");
  }

  async function playSentence(index: number, requestId: number) {
    const sentence = reader.sentences[index];
    if (!sentence || requestId !== requestIdRef.current) return;

    setPlayback("loading");
    setMessage("Synthesizing locally…");
    try {
      const wav = await invoke<ArrayBuffer>("tts_synthesize", {
        text: sentence.text,
        voice: state.settings.voice,
        speed: state.settings.speed,
      });
      if (requestId !== requestIdRef.current) return;

      releaseAudio();
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      audio.addEventListener(
        "ended",
        () => {
          if (requestId !== requestIdRef.current) return;
          const next = index + 1;
          if (next >= reader.sentences.length) {
            releaseAudio();
            setPlayback("ended");
            setMessage("End of document.");
            return;
          }
          setPosition(next);
          void playSentence(next, requestId);
        },
        { once: true },
      );
      audio.addEventListener(
        "error",
        () => {
          setPlayback("error");
          setMessage("Windows could not play the synthesized audio.");
        },
        { once: true },
      );
      await audio.play();
      setPlayback("playing");
      setMessage("Reading locally.");
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setPlayback("error");
      setMessage(String(error));
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
    const requestId = ++requestIdRef.current;
    void playSentence(currentIndex, requestId);
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
        throw new Error("SIREN v0.1 supports TXT, Markdown, and PDF files.");
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
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" type="button" onClick={beginNewText}>
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>SIREN</span>
        </button>
        <div className="document-actions">
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

      <aside className="library" aria-label="Recent documents">
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
                    className={sentence.index === currentIndex ? "current" : ""}
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
              min="0.7"
              max="1.5"
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

function voiceName(voice: string) {
  const parts = voice.split("_");
  const name = parts[parts.length - 1] || voice;
  return name[0].toUpperCase() + name.slice(1);
}

export default App;
