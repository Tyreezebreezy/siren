import type { DocumentKind } from "./reader";
import type { ThemePreference } from "./theme";

export type Settings = {
  theme: ThemePreference;
  voice: string;
  speed: number;
  autoScroll: boolean;
};

export type LibraryDocument = {
  id: string;
  name: string;
  kind: DocumentKind;
  text: string;
  position: number;
  lastOpenedAt: string;
};

export type PersistedState = {
  version: 1;
  settings: Settings;
  documents: LibraryDocument[];
  activeId: string | null;
};

export const defaultSettings: Settings = {
  theme: "system",
  voice: "af_heart",
  speed: 1,
  autoScroll: true,
};

const storageKey = "siren-state-v1";

export function emptyState(): PersistedState {
  return {
    version: 1,
    settings: defaultSettings,
    documents: [],
    activeId: null,
  };
}

export function normalizeState(value: unknown): PersistedState {
  if (!value || typeof value !== "object") return emptyState();
  const candidate = value as Partial<PersistedState>;
  if (candidate.version !== 1 || !Array.isArray(candidate.documents)) {
    return emptyState();
  }

  const settings = candidate.settings ?? defaultSettings;
  return {
    version: 1,
    settings: {
      theme:
        settings.theme === "light" || settings.theme === "dark"
          ? settings.theme
          : "system",
      voice: typeof settings.voice === "string" ? settings.voice : "af_heart",
      speed:
        typeof settings.speed === "number" &&
        settings.speed >= 0.5 &&
        settings.speed <= 2
          ? settings.speed
          : 1,
      autoScroll:
        typeof settings.autoScroll === "boolean" ? settings.autoScroll : true,
    },
    documents: candidate.documents.filter(isLibraryDocument).slice(0, 8),
    activeId:
      typeof candidate.activeId === "string" ? candidate.activeId : null,
  };
}

export function loadState(): PersistedState {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(storageKey) ?? ""));
  } catch {
    return emptyState();
  }
}

export function saveState(state: PersistedState) {
  try {
    // ponytail: localStorage is enough for v1.0; move document bodies to SQLite if real books hit browser quotas.
    localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function isLibraryDocument(value: unknown): value is LibraryDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<LibraryDocument>;
  return (
    typeof document.id === "string" &&
    typeof document.name === "string" &&
    typeof document.text === "string" &&
    typeof document.position === "number" &&
    typeof document.lastOpenedAt === "string" &&
    (document.kind === "text" ||
      document.kind === "txt" ||
      document.kind === "markdown" ||
      document.kind === "pdf")
  );
}
