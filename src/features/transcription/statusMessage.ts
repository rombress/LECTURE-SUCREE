import { FileTranscriptionError } from './fileTranscriber';
import type { LiveTranscriptState } from './status';

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
          return 'Le français hors ligne n’est pas disponible ou pas vérifiable sur cet iPhone (langue de l’iPhone autre que le français). L’audio est enregistré ; la reconnaissance en ligne peut être autorisée dans Réglages.';
        case 'language':
          return 'Le français n’est pas pris en charge par la reconnaissance. L’audio est enregistré normalement.';
        default:
          return 'Transcription interrompue. L’audio continue d’être enregistré ; vous pourrez transcrire le fichier ensuite.';
      }
  }
}

export function fileTranscriptionMessage(e: unknown): string {
  const code = e instanceof FileTranscriptionError ? e.code : 'unknown';
  switch (code) {
    case 'no-offline':
      return 'Le français hors ligne n’est pas disponible ou pas vérifiable sur cet iPhone (langue de l’iPhone autre que le français). Vous pouvez autoriser la reconnaissance en ligne dans Réglages.';
    case 'not-allowed':
      return 'La reconnaissance vocale est refusée (Réglages › Lecture sucrée).';
    case 'language-not-supported':
      return 'Le français n’est pas pris en charge par la reconnaissance.';
    case 'no-audio':
      return 'Fichier audio introuvable.';
    case 'empty':
      return 'Aucune parole reconnue dans cet enregistrement.';
    case 'cancelled':
      return 'Transcription annulée. Rien n’a été modifié.';
    case 'changed':
      return 'Le texte a été modifié pendant la transcription : votre version est conservée, rien n’a été remplacé.';
    case 'timeout':
      return 'La transcription a pris trop de temps et a été arrêtée.';
    default:
      return 'La transcription a échoué. L’audio n’a pas été modifié.';
  }
}
