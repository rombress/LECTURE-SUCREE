/**
 * Transcription différée de l'audio d'une session (appareil). L'audio n'est
 * que LU ; le résultat remplace le texte uniquement sur demande explicite.
 */
import type { DbLike } from '@/data/db/types';
import { replaceTranscriptFromAudio, type SessionSummary } from '@/data/repositories/sessions';
import { finalFile } from '@/features/recording/audioStore';

import { deviceSpeechEngine, engineAvailability, requestSpeechPermission } from './deviceEngine';
import { LOCALE, engineId, fileOptions, fileTimeoutMs } from './engine';
import { FileTranscriptionError, transcribeFile } from './fileTranscriber';

export async function transcribeSessionAudio(db: DbLike, session: SessionSummary, allowNetwork: boolean): Promise<string> {
  if (!session.audioPath) throw new FileTranscriptionError('no-audio');
  const avail = engineAvailability(allowNetwork);
  if (!avail.ok) throw new FileTranscriptionError(avail.reason);
  if (!(await requestSpeechPermission())) throw new FileTranscriptionError('not-allowed');
  const file = finalFile(session.audioPath);
  if (!file.exists) throw new FileTranscriptionError('no-audio');
  const text = (await transcribeFile(deviceSpeechEngine, fileOptions(file.uri, allowNetwork), fileTimeoutMs(session.durationMs))).trim();
  if (!text) throw new FileTranscriptionError('empty');
  await replaceTranscriptFromAudio(db, session.id, { raw: text, engine: `${engineId(allowNetwork)}-file`, locale: LOCALE }, new Date().toISOString());
  return text;
}
