/**
 * Transcription différée d'un fichier audio déjà enregistré (repli quand la
 * transcription en direct a échoué ou était désactivée). Le fichier n'est
 * que LU : l'audio original n'est jamais modifié.
 */
import type { ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

import { TranscriptAccumulator } from './accumulator';
import type { SpeechEngine } from './engine';

export class FileTranscriptionError extends Error {
  constructor(public readonly code: string) {
    super(`Transcription impossible (${code})`);
    this.name = 'FileTranscriptionError';
  }
}

/**
 * Lance la reconnaissance sur le fichier et résout le texte complet à la fin.
 * `timeoutMs` : garde-fou (le moteur lit le fichier plus vite que le temps réel).
 */
export function transcribeFile(engine: SpeechEngine, options: ExpoSpeechRecognitionOptions, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const acc = new TranscriptAccumulator();
    let fatal: string | null = null;
    let done = false;
    const subs: (() => void)[] = [];
    const finish = (err?: FileTranscriptionError) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subs.forEach((u) => u());
      acc.onTaskEnd();
      if (err) reject(err);
      else resolve(acc.fullText);
    };
    const timer = setTimeout(() => {
      try {
        engine.abort();
      } catch {
        /* ignoré */
      }
      finish(acc.fullText ? undefined : new FileTranscriptionError('timeout'));
    }, timeoutMs);

    subs.push(
      engine.on('result', ({ text, isFinal }) => void acc.onResult(text, isFinal)),
      engine.on('error', ({ code }) => {
        if (code !== 'no-speech' && code !== 'aborted') fatal = code;
      }),
      engine.on('end', () => {
        if (fatal && !acc.fullText) finish(new FileTranscriptionError(fatal));
        else finish();
      }),
    );
    try {
      engine.start(options);
    } catch {
      finish(new FileTranscriptionError('start'));
    }
  });
}
