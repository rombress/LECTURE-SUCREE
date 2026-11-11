import { router } from 'expo-router';
import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SessionSummary } from '@/data/repositories/sessions';
import { formatDateTime, formatDuration } from '@/domain/time';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/**
 * Ligne de session. Appui : réécoute. Appui long (si `onDelete`) : menu
 * natif avec « Supprimer la session » (confirmation gérée par l'appelant).
 */
export function SessionRow({
  session,
  showVolume,
  onDelete,
}: {
  session: SessionSummary;
  showVolume?: boolean;
  onDelete?: (s: SessionSummary) => void;
}) {
  const { colors } = useTheme();
  const openMenu = () => {
    if (!onDelete) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Réécouter', 'Supprimer la session…', 'Annuler'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      (i) => {
        if (i === 0) router.push(`/session/${session.id}`);
        if (i === 1) onDelete(session);
      },
    );
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={onDelete ? 'Appui long pour supprimer' : undefined}
      onPress={() => router.push(`/session/${session.id}`)}
      onLongPress={onDelete ? openMenu : undefined}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        {showVolume ? (
          <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: '600' }}>
            {session.volumeTitle}
          </Text>
        ) : null}
        <Text style={{ color: showVolume ? colors.textSecondary : colors.textPrimary, fontWeight: showVolume ? '400' : '600' }}>
          {formatDateTime(session.startedAt)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {formatDuration(session.durationMs)}
          {session.page != null ? ` · page ${session.page}` : ''}
          {session.state === 'interrupted' ? ' · interrompue' : ''}
          {session.state === 'recording' || session.state === 'paused' ? ' · en cours' : ''}
          {session.audioPath ? '' : ' · sans audio'}
        </Text>
      </View>
      <Text style={{ color: colors.accent, fontSize: 20 }}>▶</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
  },
});
