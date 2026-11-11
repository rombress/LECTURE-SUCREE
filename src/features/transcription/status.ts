import type { TranscriptStatus } from '@/domain/models';

import type { TranscriberStatus, UnavailableReason } from './liveTranscriber';

export type LiveTranscriptState =
  | { status: 'off' }
  | { status: TranscriberStatus; reason?: UnavailableReason };

/** Statut final enregistré avec la session. */
export function finalTranscriptStatus(enabled: boolean, text: string, unavailable: boolean): TranscriptStatus {
  if (!enabled) return 'none';
  if (unavailable) return text ? 'partial' : 'failed';
  return text ? 'complete' : 'none';
}
