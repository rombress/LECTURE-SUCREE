import { Alert } from 'react-native';

import { formatDateTime, formatDuration } from '@/domain/time';

import { DeletionError } from './deletion';

/** Confirmation iOS native ; le bouton d'action est rouge (destructive). Résout true si confirmé. */
export function confirmDestructive(title: string, message: string, actionLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
        { text: actionLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function confirmSessionDeletion(s: { startedAt: string; durationMs: number; audioPath: string | null }) {
  return confirmDestructive(
    'Supprimer cette session ?',
    `Session du ${formatDateTime(s.startedAt)} (${formatDuration(s.durationMs)}).\n\n` +
      (s.audioPath ? 'Son enregistrement audio sera définitivement effacé de l’iPhone. ' : '') +
      'Les autres sessions ne sont pas touchées.\n\nPour garder l’audio, exportez-le d’abord.',
    'Supprimer',
  );
}

export function deletionErrorMessage(e: unknown): string {
  if (e instanceof DeletionError) return e.message;
  return 'La suppression a échoué. Rien n’a été supprimé.';
}

export function showDeletionError(e: unknown) {
  Alert.alert('Suppression impossible', deletionErrorMessage(e));
}
