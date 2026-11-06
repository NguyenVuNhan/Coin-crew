export const THEME_IDS = ['jade', 'orchid', 'sky', 'indigo'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'jade';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** The theme in view: a group's colours win inside it, else the signed-in person's own, else Jade. Unknown ids count as none. */
export function resolveTheme(input: { personal?: string | null; group?: string | null }): ThemeId {
  if (isThemeId(input.group)) return input.group;
  if (isThemeId(input.personal)) return input.personal;
  return DEFAULT_THEME;
}
