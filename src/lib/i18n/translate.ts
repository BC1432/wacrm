/**
 * Framework-agnostic translation core. No "use client" directive on
 * purpose — this module is importable from React components, plain
 * lib code (e.g. toast messages fired from helpers), and tests alike.
 *
 * React components should use `useI18n()` from `@/hooks/use-language`
 * (it re-renders on language change). Non-React code can call
 * `tActive()`, which reads the module-level active language that the
 * LanguageProvider keeps in sync; on the server that's always the
 * default language, which is fine because such strings (toasts) only
 * ever fire in the browser.
 */

import { DEFAULT_LANGUAGE, type Language } from "./config";
import en from "./en.json";
import es from "./es.json";

type Dictionary = { [key: string]: string | Dictionary };

const DICTIONARIES: Record<Language, Dictionary> = { en, es };

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translate(
  language: Language,
  key: string,
  vars?: Record<string, string | number>,
): string {
  // Pluralized keys: `t("x.unread", { count })` prefers `x.unread_one`
  // when count === 1 and `x.unread_other` otherwise, if they exist.
  let resolvedKey = key;
  if (vars && typeof vars.count === "number") {
    const variant = `${key}_${vars.count === 1 ? "one" : "other"}`;
    if (
      lookup(DICTIONARIES[language], variant) !== undefined ||
      lookup(DICTIONARIES[DEFAULT_LANGUAGE], variant) !== undefined
    ) {
      resolvedKey = variant;
    }
  }
  const value =
    lookup(DICTIONARIES[language], resolvedKey) ??
    lookup(DICTIONARIES[DEFAULT_LANGUAGE], resolvedKey);
  if (value === undefined) return key;
  return interpolate(value, vars);
}

// ---------------------------------------------------------------------------
// Active-language escape hatch for non-React code.
// ---------------------------------------------------------------------------

let activeLanguage: Language = DEFAULT_LANGUAGE;

/** Called by the LanguageProvider whenever the language changes. */
export function setActiveLanguage(next: Language) {
  activeLanguage = next;
}

export function getActiveLanguage(): Language {
  return activeLanguage;
}

/**
 * Translate using the currently active language. For code that runs
 * outside the React tree (lib helpers, event callbacks in plain
 * modules). Inside components prefer `useI18n().t` so the text
 * re-renders when the user switches language.
 */
export function tActive(
  key: string,
  vars?: Record<string, string | number>,
): string {
  return translate(activeLanguage, key, vars);
}
