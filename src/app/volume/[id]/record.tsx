import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { getVolume } from '@/data/repositories/volumes';
import { formatDuration } from '@/domain/time';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { parseOptionalInt } from '@/features/library/VolumeForm';
import { useRecordingSession } from '@/features/recording/useRecordingSession';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { colors, fonts } = useTheme();
  const load = useCallback(() => getVolume(db, id), [db, id]);
  const { data: volume } = useFocusLoad(load);
  const rec = useRecordingSession(db, id);
  const [page, setPage] = useState(volume?.currentPage ? String(volume.currentPage) : '');
  const [pageError, setPageError] = useState<string | undefined>();

  const active = rec.phase === 'recording' || rec.phase === 'paused' || rec.phase === 'starting' || rec.phase === 'stopping';

  const onStart = () => {
    const p = parseOptionalInt(page);
    if (p !== null && Number.isNaN(p)) {
      setPageError('Entier positif attendu.');
      return;
    }
    setPageError(undefined);
    void rec.start(p);
  };

  const status = rec.interrupted
    ? 'Interrompu par le système — appuyez sur Reprendre'
    : rec.phase === 'recording'
      ? 'Enregistrement en cours'
      : rec.phase === 'paused'
        ? 'En pause'
        : rec.phase === 'stopping'
          ? 'Sauvegarde…'
          : rec.phase === 'done'
            ? 'Session enregistrée'
            : rec.phase === 'starting'
              ? 'Préparation…'
              : 'Prêt';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Impossible de quitter l'écran pendant un enregistrement (évite un audio orphelin). */}
      <Stack.Screen options={{ gestureEnabled: !active, headerBackVisible: !active, headerLeft: active ? () => null : undefined }} />
      <View style={styles.container}>
        <Text numberOfLines={2} style={[styles.book, { color: colors.textSecondary, fontFamily: fonts.serif }]}>
          {volume?.title ?? ''}
        </Text>

        <View style={styles.center}>
          <View
            style={[
              styles.dot,
              { backgroundColor: rec.phase === 'recording' && !rec.interrupted ? colors.danger : colors.border },
            ]}
          />
          <Text style={[styles.timer, { color: colors.textPrimary }]}>{formatDuration(rec.durationMs)}</Text>
          <Text style={{ color: rec.interrupted ? colors.warning : colors.textMuted }}>{status}</Text>
          {rec.fileSize > 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{(rec.fileSize / 1e6).toFixed(1)} Mo sur l’appareil</Text>
          ) : null}
        </View>

        {rec.error === 'permission' ? (
          <View style={styles.notice}>
            <Text style={{ color: colors.warning, textAlign: 'center' }}>
              L’accès au micro est refusé. Autorisez-le dans Réglages › Lecture sucrée › Micro.
            </Text>
            <Button label="Ouvrir les réglages" variant="secondary" onPress={() => void Linking.openSettings()} />
          </View>
        ) : null}
        {rec.error === 'start' ? (
          <Text style={[styles.errorText, { color: colors.danger }]}>L’enregistrement n’a pas pu démarrer. Réessayez.</Text>
        ) : null}
        {rec.error === 'finalize' ? (
          <Text style={[styles.errorText, { color: colors.danger }]}>
            La sauvegarde de fin a échoué. L’audio est conservé et sera récupéré automatiquement au prochain lancement.
          </Text>
        ) : null}

        <View style={styles.controls}>
          {rec.phase === 'idle' ? (
            <>
              <Field
                label="Page (facultatif)"
                value={page}
                onChangeText={setPage}
                keyboardType="number-pad"
                error={pageError}
              />
              <Button label="● Démarrer" onPress={onStart} big />
            </>
          ) : null}
          {rec.phase === 'recording' && !rec.interrupted ? <Button label="Pause" variant="secondary" onPress={rec.pause} big /> : null}
          {rec.phase === 'paused' || rec.interrupted ? <Button label="Reprendre" variant="secondary" onPress={rec.resume} big /> : null}
          {rec.phase === 'recording' || rec.phase === 'paused' ? (
            <Button label="■ Terminer et enregistrer" onPress={() => void rec.stop()} big />
          ) : null}
          {rec.phase === 'stopping' || rec.phase === 'starting' ? <Button label="…" onPress={() => undefined} busy big /> : null}
          {rec.phase === 'done' && rec.sessionId ? (
            <>
              <Button label="Réécouter" onPress={() => router.replace(`/session/${rec.sessionId}`)} big />
              <Button label="Retour au livre" variant="secondary" onPress={() => router.back()} />
            </>
          ) : null}
          {rec.phase === 'error' ? <Button label="Fermer" variant="secondary" onPress={() => router.back()} /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl, justifyContent: 'space-between' },
  book: { fontSize: 18, textAlign: 'center' },
  center: { alignItems: 'center', gap: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7 },
  timer: { fontSize: 64, fontWeight: '200', fontVariant: ['tabular-nums'] },
  notice: { gap: spacing.md },
  errorText: { textAlign: 'center' },
  controls: { gap: spacing.md },
});
