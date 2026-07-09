"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isLanguage,
  type Language,
} from "@/lib/i18n/config";
import { setActiveLanguage, translate } from "@/lib/i18n/translate";

/**
 * LanguageProvider — owns the UI language axis (English / Spanish),
 * mirroring the ThemeProvider pattern in `use-theme.tsx`.
 *
 * Persistence is localStorage only (device-scoped), same trade-off as
 * theme/mode. The boot script in `src/app/layout.tsx` only sets the
 * `<html lang>` attribute pre-paint; the translated *text* can't be
 * swapped before hydration because the server always renders the
 * default language. To avoid hydration mismatches we therefore start
 * from DEFAULT_LANGUAGE on both server and first client render, and
 * switch to the stored choice in a mount effect. Non-default users see
 * the default strings for one frame — same class of trade-off the
 * theme system solves with its boot script, but applied to text where
 * a pre-paint swap isn't possible without locale-prefixed routes
 * (which would change every URL in the app).
 *
 * Dictionaries are plain nested JSON (`src/lib/i18n/en.json` /
 * `es.json`) resolved by `@/lib/i18n/translate` — see that module for
 * the lookup / fallback / plural / interpolation rules.
 */

export type Translator = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

interface LanguageContextValue {
  language: Language;
  setLanguage: (next: Language) => void;
  t: Translator;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start from the default so the first client render matches
  // the server-rendered HTML (see the hydration note above).
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  // After mount, adopt the stored choice (if any).
  useEffect(() => {
    let frame = 0;
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isLanguage(stored)) {
        frame = window.requestAnimationFrame(() => {
          setLanguageState(stored);
        });
      }
    } catch {
      // localStorage can throw in private-browsing / sandboxed contexts.
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Same private-browsing edge case; in-memory state still updates.
    }
  }, []);

  // Keep <html lang> and the module-level active language (used by
  // non-React code via `tActive`) in sync with the state — covers both
  // setLanguage calls and the initial adoption from localStorage.
  useEffect(() => {
    document.documentElement.lang = language;
    setActiveLanguage(language);
  }, [language]);

  // Sync from other tabs — change language in tab A, tab B catches up.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== LANGUAGE_STORAGE_KEY) return;
      if (isLanguage(e.newValue) && e.newValue !== language) {
        setLanguageState(e.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider — behaves
    // as the default language with a no-op setter, so callers don't
    // crash (same graceful degradation as useTheme).
    return {
      language: DEFAULT_LANGUAGE,
      setLanguage: () => {},
      t: (key, vars) => translate(DEFAULT_LANGUAGE, key, vars),
    };
  }
  return ctx;
}
