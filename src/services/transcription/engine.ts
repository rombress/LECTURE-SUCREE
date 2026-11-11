/**
 * Port de transcription (contrat). AUCUNE implémentation au lot 0.
 *
 * L'enregistrement audio et la transcription sont deux responsabilités
 * séparées : l'audio est la source de vérité, la transcription est un produit
 * dérivé. Si le moteur échoue, l'audio continue d'être enregistré et la
 * session reste exploitable (transcription différée depuis le fichier).
 *
 * Les implémentations candidates sont comparées dans docs/TRANSCRIPTION.md et
 * seront choisies après le spike du lot 1 sur appareils réels.
 */

export type EngineId = 'native-ondevice' | 'native-network' | 'whisper-local';

export interface EngineCapabilities {
  available: boolean;
  onDevice: boolean;
  continuous: boolean;
  /** Le moteur peut lui-même conserver l'audio capté (évite deux captures concurrentes). */
  persistsAudio: boolean;
  /** Transcription différée d'un fichier audio existant. */
  fileTranscription: boolean;
  locales: string[];
}

export interface TranscriptChunk {
  text: string;
  isFinal: boolean;
  offsetMs: number | null;
}

export type EngineEvent =
  | { type: 'chunk'; chunk: TranscriptChunk }
  | { type: 'audio-file'; uri: string }
  | { type: 'interrupted'; reason: 'call' | 'route' | 'system' | 'unknown' }
  | { type: 'error'; code: string; recoverable: boolean }
  | { type: 'end' };

export interface LiveSessionOptions {
  locale: string;
  requireOnDevice: boolean;
  persistAudioTo: string | null;
}

export interface TranscriptionEngine {
  readonly id: EngineId;
  capabilities(locale: string): Promise<EngineCapabilities>;
  start(opts: LiveSessionOptions, onEvent: (e: EngineEvent) => void): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  transcribeFile?(uri: string, locale: string, onEvent: (e: EngineEvent) => void): Promise<void>;
}
