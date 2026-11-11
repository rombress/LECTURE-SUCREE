/**
 * Enregistrement d'une session vocale (MVP : audio seul).
 *
 * Garanties de conception :
 * 1. La session est créée en base AVANT la capture : un plantage pendant
 *    l'enregistrement est récupéré au prochain lancement (recovery.ts).
 * 2. L'audio est écrit directement dans Documents (jamais dans le cache).
 * 3. La durée est sauvegardée en base toutes les 5 s.
 * 4. Interruption système (appel, Siri, alarme) : expo-audio met le recorder
 *    en pause (vérifié dans son code Swift) ; l'écran l'affiche et propose
 *    de reprendre. Le fichier n'est pas perdu.
 * 5. Arrière-plan / écran verrouillé : `allowsBackgroundRecording: true`
 *    (sinon expo-audio met le recorder en pause en arrière-plan) +
 *    UIBackgroundModes=audio (config plugin). À VÉRIFIER sur l'iPhone.
 */
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DbLike } from '@/data/db/types';
import { createSession, finalizeSession, touchSession } from '@/data/repositories/sessions';
import { utcOffsetOf } from '@/domain/time';
import { log } from '@/services/log';

import { deviceAudioOps, settleAudio } from './audioStore';

/** Voix : AAC mono 64 kbit/s, ≈ 29 Mo/heure. */
export const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

export type RecordingPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'done' | 'error';
export type RecordingErrorKind = 'permission' | 'start' | 'finalize';

const AUTOSAVE_MS = 5000;

export function useRecordingSession(db: DbLike | null, volumeId: string) {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const recState = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [error, setError] = useState<RecordingErrorKind | null>(null);
  const session = useRef<{ id: string; startedAt: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Interruption système : le recorder ne tourne plus alors que nous pensions enregistrer.
  const interrupted = phase === 'recording' && !recState.isRecording && recState.durationMillis > 0;

  // Sauvegarde régulière de la durée.
  useEffect(() => {
    if (!db || (phase !== 'recording' && phase !== 'paused')) return;
    const timer = setInterval(() => {
      const s = session.current;
      if (!s) return;
      const st = recorder.getStatus();
      touchSession(db, s.id, st.durationMillis, st.isRecording ? 'recording' : 'paused', new Date().toISOString()).catch(() =>
        log.warn('recording.autosave_failed'),
      );
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [db, phase, recorder]);

  const start = useCallback(
    async (page: number | null) => {
      if (!db || phase !== 'idle') return;
      setPhase('starting');
      setError(null);
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('permission');
        setPhase('idle');
        return;
      }
      const id = randomUUID();
      const startedAt = new Date().toISOString();
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          allowsBackgroundRecording: true,
          interruptionMode: 'doNotMix',
        });
        // 1. La session existe en base AVANT toute capture.
        await createSession(db, { id, volumeId, startedAt, utcOffset: utcOffsetOf(new Date(startedAt)), page });
        session.current = { id, startedAt };
        setSessionId(id);
        // 2. Fichier dans Documents/ExpoAudio/<id>.m4a
        await recorder.prepareToRecordAsync({ ...VOICE_RECORDING, directory: 'document', fileName: id });
        recorder.record();
        setPhase('recording');
        log.info('recording.started');
      } catch (e) {
        log.error('recording.start_failed', { kind: e instanceof Error ? e.name : 'unknown' });
        setError('start');
        setPhase('error');
        // Si la session a été créée, on la clôt honnêtement (sans audio s'il n'y en a pas).
        if (session.current) {
          const s = session.current;
          const audio = await settleAudio(deviceAudioOps, s.id, s.startedAt, 0).catch(() => null);
          await finalizeSession(db, s.id, { endedAt: new Date().toISOString(), durationMs: 0, state: 'interrupted', audio }).catch(
            () => undefined,
          );
        }
      }
    },
    [db, phase, recorder, volumeId],
  );

  const pause = useCallback(() => {
    if (phase !== 'recording') return;
    recorder.pause();
    setPhase('paused');
  }, [phase, recorder]);

  const resume = useCallback(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    recorder.record();
    setPhase('recording');
  }, [phase, recorder]);

  /** Arrêt : finalise le fichier, le déplace, calcule le SHA-256, clôt la session. */
  const stop = useCallback(async () => {
    const s = session.current;
    if (!db || !s || (phase !== 'recording' && phase !== 'paused')) return;
    setPhase('stopping');
    const durationMs = recorder.getStatus().durationMillis;
    try {
      await recorder.stop();
      const audio = await settleAudio(deviceAudioOps, s.id, s.startedAt, durationMs);
      await finalizeSession(db, s.id, { endedAt: new Date().toISOString(), durationMs, state: 'completed', audio });
      log.info('recording.completed', { durationMs, hasAudio: audio !== null });
      setPhase('done');
    } catch (e) {
      // La session reste « recording » en base : elle sera récupérée au prochain
      // lancement, avec son audio. Rien n'est supprimé.
      log.error('recording.finalize_failed', { kind: e instanceof Error ? e.name : 'unknown' });
      setError('finalize');
      setPhase('error');
    } finally {
      await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false }).catch(() => undefined);
    }
  }, [db, phase, recorder]);

  return {
    phase,
    error,
    sessionId,
    interrupted,
    durationMs: recState.durationMillis,
    fileSize: recState.fileSize,
    start,
    pause,
    resume,
    stop,
  };
}
