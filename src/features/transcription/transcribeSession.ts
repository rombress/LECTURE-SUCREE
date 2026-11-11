/**
 * Transcription différée de l'audio d'une session (appareil). L'audio n'est
 * que LU ; le résultat remplace le texte uniquement sur demande explicite.
 */
import type { DbLike } from '@/data/db/types';
import { replaceTranscriptFromAudio, type SessionSummary } from '@/data/repositories/sessions';
import { finalFile } from '@/features/recording/audioStore';

import { deviceSpeechEngine, engineAvailability, requestSpeechPermission } from './deviceEngine';
import { LOCALE, engineId, fileOptions, fileTimeoutMs } from './engine';
import { FileTranscriptionError, transcribeFile, type CancelHandle } from './fileTranscriber';

/**
 * Retranscrit l'audio d'une session. `expectedText` = texte affiché au moment
 * de la demande : si l'utilisateur l'a corrigé entre-temps, rien n'est écrit
 * (erreur `changed`). Résultat partiel signalé comme tel.
 */
export async function transcribeSessionAudio(
  db: DbLike,
  session: SessionSummary,
  allowNetwork: boolean,
  handle?: (h: CancelHandle) => void,
): Promise<{ complete: boolean }> {
  if (!session.audioPath) throw new FileTranscriptionError('no-audio');
  const avail = engineAvailability(allowNetwork);
  if (!avail.ok) throw new FileTranscriptionError(avail.reason);
  if (!(await requestSpeechPermission())) throw new FileTranscriptionError('not-allowed');
  const file = finalFile(session.audioPath);
  if (!file.exists) throw new FileTranscriptionError('no-audio');
  const { text, complete } = await transcribeFile(
    deviceSpeechEngine,
    fileOptions(file.uri, allowNetwork),
    fileTimeoutMs(session.durationMs),
    handle,
  );
  const clean = text.trim();
  if (!clean) throw new FileTranscriptionError('empty');
  const written = await replaceTranscriptFromAudio(
    db,
    session.id,
    { raw: clean, engine: `${engineId(allowNetwork)}-file`, locale: LOCALE, complete, expectedText: session.transcriptText },
    new Date().toISOString(),
  );
  if (!written) throw new FileTranscriptionError('changed');
  return { complete };
}
