import { useEffect, useState } from "react";
import "./App.css";
import {
  parseThemePreference,
  resolveTheme,
  type ThemePreference,
} from "./theme";

const themeOptions: ThemePreference[] = ["system", "light", "dark"];

function loadTheme(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem("siren-theme"));
  } catch {
    return "system";
  }
}

function App() {
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme = resolveTheme(
        theme,
        systemDark.matches,
      );
    };

    applyTheme();
    try {
      localStorage.setItem("siren-theme", theme);
    } catch {
      // The theme still works when storage is unavailable.
    }

    if (theme === "system") {
      systemDark.addEventListener("change", applyTheme);
      return () => systemDark.removeEventListener("change", applyTheme);
    }
  }, [theme]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">SIREN</span>
        <fieldset className="theme-control">
          <legend>Theme</legend>
          {themeOptions.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="theme"
                value={option}
                checked={theme === option}
                onChange={() => setTheme(option)}
              />
              <span>{option[0].toUpperCase() + option.slice(1)}</span>
            </label>
          ))}
        </fieldset>
      </header>

      <main>
        <section aria-labelledby="ready-heading">
          <h1 id="ready-heading">Local reading, ready.</h1>
          <p className="lede">
            SIREN is ready for its offline text-to-speech engine.
          </p>
          <ul className="status-list">
            {[
              "Keyboard focus visible",
              "Theme preference saved",
              "Local-only foundation",
            ].map((item) => (
              <li key={item}>
                <span aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer>
        <span>SIREN · Tauri 2 · React · TypeScript · Rust</span>
        <span>Local · Offline</span>
      </footer>
    </div>
  );
}

export default App;
