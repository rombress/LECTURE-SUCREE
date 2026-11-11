import { createTestDb } from '@/__testutils__/nodeDb';
import { DEFAULT_TRANSCRIPTION_PREFS, getTranscriptionPrefs, setTranscriptionPrefs } from '@/data/repositories/settings';

import { fileTimeoutMs } from '../engine';
import { FileTranscriptionError } from '../fileTranscriber';
import { finalTranscriptStatus } from '../status';
import { fileTranscriptionMessage, transcriptStatusMessage } from '../statusMessage';

describe('statut final de transcription', () => {
  it('désactivée → none ; texte → complete ; indisponible → partial ou failed', () => {
    expect(finalTranscriptStatus(false, 'texte', false)).toBe('none');
    expect(finalTranscriptStatus(true, 'texte', false)).toBe('complete');
    expect(finalTranscriptStatus(true, '', false)).toBe('none');
    expect(finalTranscriptStatus(true, 'début', true)).toBe('partial');
    expect(finalTranscriptStatus(true, '', true)).toBe('failed');
  });
});

describe('messages', () => {
  it('chaque indisponibilité rassure sur l’audio', () => {
    for (const reason of ['permission', 'no-offline', 'language', 'loop', 'service', 'unknown'] as const) {
      const m = transcriptStatusMessage({ status: 'unavailable', reason }, false);
      expect(m).toMatch(/audio/i);
    }
  });
  it('pause : distingue la pause de l’utilisateur d’une interruption par le système', () => {
    expect(transcriptStatusMessage({ status: 'paused' }, false, true)).toBe('Transcription en pause');
    const sys = transcriptStatusMessage({ status: 'paused' }, false, false);
    expect(sys).toMatch(/interrompue/);
    expect(sys).toMatch(/audio continue/);
    expect(sys).toMatch(/retranscrit/);
  });
  it('en écoute : précise « sur l’iPhone » quand le réseau n’est pas autorisé', () => {
    expect(transcriptStatusMessage({ status: 'listening' }, false)).toMatch(/sur l’iPhone/);
    expect(transcriptStatusMessage({ status: 'off' }, false)).toBeNull();
  });
  it('erreurs de transcription de fichier', () => {
    expect(fileTranscriptionMessage(new FileTranscriptionError('no-offline'))).toMatch(/hors ligne/);
    expect(fileTranscriptionMessage(new Error('x'))).toMatch(/audio n’a pas été modifié/);
  });
  it('délai maximal de transcription d’un fichier', () => {
    expect(fileTimeoutMs(0)).toBe(60_000);
    expect(fileTimeoutMs(600_000)).toBe(1_230_000);
  });
});

describe('préférences de transcription (SQLite réel)', () => {
  it('valeurs par défaut : en direct, sur l’appareil uniquement', async () => {
    const db = createTestDb();
    expect(await getTranscriptionPrefs(db)).toEqual(DEFAULT_TRANSCRIPTION_PREFS);
    expect(DEFAULT_TRANSCRIPTION_PREFS).toEqual({ live: true, allowNetwork: false });
  });
  it('enregistre, met à jour, et résiste à une valeur corrompue', async () => {
    const db = createTestDb();
    await setTranscriptionPrefs(db, { live: false, allowNetwork: true });
    expect(await getTranscriptionPrefs(db)).toEqual({ live: false, allowNetwork: true });
    await setTranscriptionPrefs(db, { live: true, allowNetwork: false });
    expect(await getTranscriptionPrefs(db)).toEqual({ live: true, allowNetwork: false });
    db.raw.prepare("UPDATE app_settings SET value = 'pas du json' WHERE key = 'transcription.prefs'").run();
    expect(await getTranscriptionPrefs(db)).toEqual(DEFAULT_TRANSCRIPTION_PREFS);
  });
});
