/**
 * Transcription différée d'un fichier audio déjà enregistré (repli quand la
 * transcription en direct a échoué ou était désactivée). Le fichier n'est
 * que LU : l'audio original n'est jamais modifié.
 *
 * - Prend le verrou du moteur (une seule utilisation à la fois).
 * - Annulable (écran quitté, enregistrement lancé) : rien n'est alors écrit.
 * - Signale si le texte est COMPLET ou seulement PARTIEL (délai dépassé,
 *   erreur après un début de texte) — relecture du 2026-11-11, bug 5.
 */
import type { ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

import { TranscriptAccumulator } from './accumulator';
import type { SpeechEngine } from './engine';
import { acquireEngine } from './engineLock';

export class FileTranscriptionError extends Error {
  constructor(public readonly code: string) {
    super(`Transcription impossible (${code})`);
    this.name = 'FileTranscriptionError';
  }
}

export interface FileTranscriptionResult {
  text: string;
  complete: boolean;
}

export interface CancelHandle {
  cancel: () => void;
}

export async function transcribeFile(
  engine: SpeechEngine,
  options: ExpoSpeechRecognitionOptions,
  timeoutMs: number,
  handle?: (h: CancelHandle) => void,
): Promise<FileTranscriptionResult> {
  let cancelRun: (() => void) | null = null;
  let cancelledBeforeRun = false;
  let runEnded: Promise<void> = Promise.resolve();
  const cancel = () => {
    if (cancelRun) cancelRun();
    else cancelledBeforeRun = true;
  };
  handle?.({ cancel });
  const release = await acquireEngine({
    cancel: async () => {
      cancel();
      await runEnded;
    },
  });
  if (cancelledBeforeRun) {
    release();
    throw new FileTranscriptionError('cancelled');
  }
  let markEnded: () => void = () => undefined;
  runEnded = new Promise<void>((r) => (markEnded = r));
  try {
    return await new Promise<FileTranscriptionResult>((resolve, reject) => {
      const acc = new TranscriptAccumulator();
      let fatal: string | null = null;
      let done = false;
      const subs: (() => void)[] = [];
      const finish = (outcome: { error: FileTranscriptionError } | { complete: boolean }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        subs.forEach((u) => u());
        acc.onTaskEnd();
        markEnded();
        if ('error' in outcome) reject(outcome.error);
        else resolve({ text: acc.fullText, complete: outcome.complete });
      };
      const abortEngine = () => {
        try {
          engine.abort();
        } catch {
          /* ignoré */
        }
      };
      const timer = setTimeout(() => {
        abortEngine();
        finish(acc.fullText ? { complete: false } : { error: new FileTranscriptionError('timeout') });
      }, timeoutMs);
      cancelRun = () => {
        abortEngine();
        finish({ error: new FileTranscriptionError('cancelled') });
      };

      subs.push(
        engine.on('result', ({ text, isFinal }) => void acc.onResult(text, isFinal)),
        engine.on('error', ({ code }) => {
          if (code !== 'no-speech' && code !== 'aborted') fatal = code;
        }),
        engine.on('end', () => {
          if (fatal && !acc.fullText) finish({ error: new FileTranscriptionError(fatal) });
          else finish({ complete: !fatal });
        }),
      );
      try {
        engine.start(options);
      } catch {
        finish({ error: new FileTranscriptionError('start') });
      }
    });
  } finally {
    markEnded();
    release();
  }
}
