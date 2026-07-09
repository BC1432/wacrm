"use client";

import { Check, Languages, Moon, Palette, SunMoon, Sun } from "lucide-react";

import { useI18n } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import {
  LANGUAGE_LABELS,
  LANGUAGES,
  type Language,
} from "@/lib/i18n/config";
import { MODES, THEMES, type Mode, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Appearance panel — language + light/dark mode + accent-color picker.
 *
 * Three independent controls: the language picker (English / Español),
 * a mode toggle (light / dark) and the accent grid. Any change applies
 * + persists immediately. No save button: each change is a single
 * attribute/state swap, there's nothing to roll back.
 *
 * Persistence: localStorage only (device-scoped). The boot script in
 * layout.tsx replays the choices before first paint on subsequent
 * loads (for language, only the <html lang> attribute — the strings
 * follow once the LanguageProvider adopts the stored choice).
 */
export function AppearancePanel() {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme, mode, setMode } = useTheme();
  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t("appearance.title")}
        description={t("appearance.description")}
      />

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Languages className="size-4 text-muted-foreground" />
          {t("appearance.language")}
        </h3>

        <div
          role="radiogroup"
          aria-label={t("appearance.language")}
          className="grid max-w-md grid-cols-2 gap-3"
        >
          {LANGUAGES.map((l) => (
            <LanguageCard
              key={l}
              language={l}
              isActive={l === language}
              onPick={() => setLanguage(l)}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SunMoon className="size-4 text-muted-foreground" />
          {t("appearance.mode")}
        </h3>

        <div
          role="radiogroup"
          aria-label={t("appearance.colorMode")}
          className="grid max-w-md grid-cols-2 gap-3"
        >
          {MODES.map((m) => (
            <ModeCard
              key={m}
              mode={m}
              isActive={m === mode}
              onPick={() => setMode(m)}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Palette className="size-4 text-muted-foreground" />
          {t("appearance.accentColor")}
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t) => (
            <ThemeCard
              key={t.id}
              id={t.id}
              name={t.name}
              tagline={t.tagline}
              swatch={t.swatch}
              isActive={t.id === theme}
              onPick={() => setTheme(t.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ActiveChip() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
      <Check className="h-3 w-3" />
      {t("appearance.active")}
    </span>
  );
}

function LanguageCard({
  language,
  isActive,
  onPick,
}: {
  language: Language;
  isActive: boolean;
  onPick: () => void;
}) {
  const { t } = useI18n();
  const label = LANGUAGE_LABELS[language];
  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      aria-checked={isActive}
      aria-label={t("appearance.useLanguage", { language: label })}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-foreground"
      >
        {language}
      </span>
      <span className="flex-1 text-sm font-semibold text-foreground">
        {label}
      </span>
      {isActive && <ActiveChip />}
    </button>
  );
}

function ModeCard({
  mode,
  isActive,
  onPick,
}: {
  mode: Mode;
  isActive: boolean;
  onPick: () => void;
}) {
  const { t } = useI18n();
  const isLight = mode === "light";
  const Icon = isLight ? Sun : Moon;
  const label = t(`appearance.${mode}`);
  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      aria-checked={isActive}
      aria-label={t("appearance.useMode", { mode: label })}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-semibold text-foreground">
        {label}
      </span>
      {isActive && <ActiveChip />}
    </button>
  );
}

function ThemeCard({
  id,
  name,
  tagline,
  swatch,
  isActive,
  onPick,
}: {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string;
  isActive: boolean;
  onPick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isActive}
      aria-label={t("appearance.useTheme", { name })}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full"
          style={{
            background: swatch,
            boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.15)",
          }}
        />
        {isActive && <ActiveChip />}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {tagline}
        </div>
      </div>
      <div
        className="mt-1 flex h-2 overflow-hidden rounded-full"
        aria-hidden
      >
        <span className="flex-1" style={{ background: swatch }} />
        <span className="w-3 bg-muted-foreground/60" />
        <span className="w-3 bg-muted" />
        <span className="w-3 bg-card" />
      </div>
      <span className="sr-only">{t("appearance.themeId", { id })}</span>
    </button>
  );
}
