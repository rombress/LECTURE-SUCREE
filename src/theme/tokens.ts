/**
 * Jetons de design de Lecture sucrée.
 *
 * Direction : sombre, cinématographique, littéraire. Les couvertures sont le
 * contenu principal : l'interface reste en retrait (noirs profonds légèrement
 * chauds, textes crème, une seule couleur d'accent personnalisable).
 */

export type ThemePreference = 'system' | 'dark' | 'light';
export type ColorScheme = 'dark' | 'light';

export interface Palette {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  danger: string;
  success: string;
  warning: string;
  /** Voile pour les dégradés posés sur les couvertures. */
  scrim: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  dark: {
    background: '#0B0A0F',
    surface: '#15131B',
    surfaceRaised: '#1E1B26',
    border: '#2A2633',
    textPrimary: '#F4EEE4',
    textSecondary: '#C9C0B3',
    textMuted: '#8A8290',
    danger: '#E5484D',
    success: '#46A758',
    warning: '#F5A524',
    scrim: 'rgba(11,10,15,0.85)',
  },
  light: {
    background: '#FAF7F2',
    surface: '#FFFFFF',
    surfaceRaised: '#F2EDE5',
    border: '#E2DACE',
    textPrimary: '#1B1820',
    textSecondary: '#4A4450',
    textMuted: '#7C7482',
    danger: '#CD2B31',
    success: '#2F7D3E',
    warning: '#B26B00',
    scrim: 'rgba(250,247,242,0.85)',
  },
};

/** Couleurs d'accent proposées (l'utilisateur pourra aussi en saisir une). */
export const accentPresets = [
  { id: 'caramel', label: 'Caramel', value: '#E0A458' },
  { id: 'framboise', label: 'Framboise', value: '#D6456B' },
  { id: 'praline', label: 'Praline', value: '#C98B6B' },
  { id: 'menthe', label: 'Menthe', value: '#4FB59A' },
  { id: 'lavande', label: 'Lavande', value: '#9B8AFB' },
  { id: 'nuit', label: 'Bleu nuit', value: '#5B8DEF' },
] as const;

export const DEFAULT_ACCENT = accentPresets[0].value;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 10, lg: 16, cover: 8, pill: 999 } as const;

/**
 * Typographie. Polices système pour le lot 0 ; des polices libres (licence
 * OFL, embarquées dans l'app, aucune requête réseau) seront ajoutées au lot UI.
 */
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const, serif: true },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, serif: true },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, serif: false },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const, serif: false },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, serif: false },
} as const;

/** Format standard d'une couverture (2:3). */
export const COVER_RATIO = 2 / 3;

/** Valide une couleur hexadécimale #RRGGBB. */
export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

/** Renvoie le schéma effectif selon la préférence et le schéma système. */
export function resolveScheme(pref: ThemePreference, system: ColorScheme | null | undefined): ColorScheme {
  if (pref === 'system') return system === 'light' ? 'light' : 'dark';
  return pref;
}
