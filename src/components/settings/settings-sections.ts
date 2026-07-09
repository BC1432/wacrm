import {
  Coins,
  FileText,
  KeyRound,
  LayoutGrid,
  Palette,
  PlugZap,
  Shield,
  Tags,
  User,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'whatsapp',
  'templates',
  'fields',
  'deals',
  'members',
  'api',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  /** i18n key resolved with `t()` at render time (see `settings.rail.section.*`). */
  labelKey: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', labelKey: 'settings.rail.section.overview', icon: LayoutGrid, group: 'top' },
  profile: { id: 'profile', labelKey: 'settings.rail.section.profile', icon: User, group: 'account' },
  security: { id: 'security', labelKey: 'settings.rail.section.security', icon: Shield, group: 'account' },
  appearance: { id: 'appearance', labelKey: 'settings.rail.section.appearance', icon: Palette, group: 'account' },
  whatsapp: { id: 'whatsapp', labelKey: 'settings.rail.section.whatsapp', icon: PlugZap, group: 'workspace' },
  templates: { id: 'templates', labelKey: 'settings.rail.section.templates', icon: FileText, group: 'workspace' },
  fields: { id: 'fields', labelKey: 'settings.rail.section.fields', icon: Tags, group: 'workspace' },
  deals: { id: 'deals', labelKey: 'settings.rail.section.deals', icon: Coins, group: 'workspace' },
  members: { id: 'members', labelKey: 'settings.rail.section.members', icon: UsersRound, group: 'workspace' },
  api: { id: 'api', labelKey: 'settings.rail.section.api', icon: KeyRound, group: 'workspace' },
};

export const RAIL_GROUPS: { labelKey: string | null; group: SectionMeta['group'] }[] = [
  { labelKey: null, group: 'top' },
  { labelKey: 'settings.rail.group.account', group: 'account' },
  { labelKey: 'settings.rail.group.workspace', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
