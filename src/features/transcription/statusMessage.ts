import type { LiveTranscriptState } from '@/features/recording/useRecordingSession';

/** Message affiché pour l'état de la transcription (l'audio n'est jamais concerné). */
export function transcriptStatusMessage(t: LiveTranscriptState, allowNetwork: boolean): string | null {
  switch (t.status) {
    case 'off':
    case 'idle':
    case 'stopped':
      return null;
    case 'listening':
      return allowNetwork ? '● Transcription en direct' : '● Transcription en direct, sur l’iPhone';
    case 'restarting':
      return 'Transcription : reprise…';
    case 'paused':
      return 'Transcription en pause';
    case 'unavailable':
      switch (t.reason) {
        case 'permission':
          return 'Reconnaissance vocale refusée (Réglages › Lecture sucrée). L’audio est enregistré normalement.';
        case 'no-offline':
          return 'Le français hors ligne n’est pas disponible sur cet iPhone. L’audio est enregistré ; la reconnaissance en ligne peut être autorisée dans Réglages.';
        case 'language':
          return 'Le français n’est pas pris en charge par la reconnaissance. L’audio est enregistré normalement.';
        default:
          return 'Transcription interrompue. L’audio continue d’être enregistré ; vous pourrez transcrire le fichier ensuite.';
      }
  }
}
