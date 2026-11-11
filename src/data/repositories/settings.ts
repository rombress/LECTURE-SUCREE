import type { DbLike } from '../db/types';

/** Préférences de transcription, stockées dans app_settings (clé/valeur JSON). */
export interface TranscriptionPrefs {
  /** Transcription en direct pendant l'enregistrement. */
  live: boolean;
  /**
   * Autoriser la reconnaissance par les serveurs d'Apple si le français
   * n'est pas disponible sur l'appareil. Désactivé par défaut : l'audio ne
   * quitte pas l'iPhone.
   */
  allowNetwork: boolean;
}

export const DEFAULT_TRANSCRIPTION_PREFS: TranscriptionPrefs = { live: true, allowNetwork: false };
const KEY = 'transcription.prefs';

export async function getTranscriptionPrefs(db: DbLike): Promise<TranscriptionPrefs> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [KEY]);
  if (!row) return DEFAULT_TRANSCRIPTION_PREFS;
  try {
    const v = JSON.parse(row.value) as Partial<TranscriptionPrefs>;
    return {
      live: typeof v.live === 'boolean' ? v.live : DEFAULT_TRANSCRIPTION_PREFS.live,
      allowNetwork: typeof v.allowNetwork === 'boolean' ? v.allowNetwork : DEFAULT_TRANSCRIPTION_PREFS.allowNetwork,
    };
  } catch {
    return DEFAULT_TRANSCRIPTION_PREFS;
  }
}

export async function setTranscriptionPrefs(db: DbLike, prefs: TranscriptionPrefs): Promise<void> {
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [KEY, JSON.stringify({ live: prefs.live, allowNetwork: prefs.allowNetwork })],
  );
}
