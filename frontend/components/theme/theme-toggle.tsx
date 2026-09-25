"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "avasya-theme";

/* ------------------------------------------------------------------
 * Tiny external store so the control hydration-matches the server
 * ("dark") and syncs to the persisted theme after mount — the same
 * pattern next-themes uses, without pulling in the dependency.
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener());
}

function getSnapshot(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const getServerSnapshot = (): Theme => "dark";

/** Apply a theme to the document immediately (used by the pre-paint script too). */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Persist + apply + notify subscribers. */
export function setTheme(theme: Theme) {
  applyTheme(theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
  notify();
}

/** Segmented dark/light control. Persists to localStorage; no system watcher — keep it simple and honest. */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex items-center gap-0.5 rounded-[5px] border border-[var(--color-line)] p-0.5"
    >
      {(
        [
          ["dark", Moon, "Dark"],
          ["light", Sun, "Light"],
        ] as const
      ).map(([value, Icon, label]) => {
        const active = theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={`rounded-[4px] p-1.5 transition-colors ${
              active
                ? "bg-[var(--hover-accent)] text-[var(--color-fg)]"
                : "text-[var(--color-fg-3)] hover:text-[var(--color-fg)]"
            }`}
          >
            <Icon size={compact ? 13 : 14} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
