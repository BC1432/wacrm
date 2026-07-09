/**
 * Language (i18n) constants — mirrors the shape of `src/lib/themes.ts`
 * so the language axis works exactly like the theme/mode axes:
 * localStorage-persisted, applied by the boot script before paint
 * (only the <html lang> attribute), and owned by a React provider
 * after hydration.
 *
 * Dictionaries live next to this file as `en.json` / `es.json`. Both
 * files must expose the same key tree — `npm test` runs a parity
 * check (see `src/lib/i18n/i18n.test.ts`).
 */

export const LANGUAGES = ["en", "es"] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

export const LANGUAGE_STORAGE_KEY = "wacrm.lang";

/** Human-readable names shown in the language picker (each in its own language). */
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  es: "Español",
};

export function isLanguage(value: unknown): value is Language {
  return (
    typeof value === "string" && (LANGUAGES as readonly string[]).includes(value)
  );
}
