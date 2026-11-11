import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import {
  DEFAULT_ACCENT,
  isHexColor,
  palettes,
  resolveScheme,
  type ColorScheme,
  type Palette,
  type ThemePreference,
} from './tokens';

export interface Theme {
  scheme: ColorScheme;
  preference: ThemePreference;
  colors: Palette & { accent: string };
  fonts: { serif: string | undefined; sans: string | undefined };
  setPreference: (p: ThemePreference) => void;
  setAccent: (hex: string) => void;
}

const ThemeContext = createContext<Theme | null>(null);

// Polices système en attendant les polices embarquées (lot UI).
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: undefined });

/**
 * Lot 0 : préférences en mémoire. Elles seront persistées dans la table
 * app_settings (SQLite) au lot « Paramètres ».
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);

  const value = useMemo<Theme>(() => {
    const scheme = resolveScheme(preference, system);
    return {
      scheme,
      preference,
      colors: { ...palettes[scheme], accent },
      fonts: { serif: SERIF, sans: undefined },
      setPreference,
      setAccent: (hex: string) => {
        if (isHexColor(hex)) setAccentState(hex);
      },
    };
  }, [preference, system, accent]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme doit être utilisé dans <ThemeProvider>');
  return t;
}
