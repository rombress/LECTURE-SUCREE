import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { getTranscriptionPrefs } from '@/data/repositories/settings';
import { getVolume } from '@/data/repositories/volumes';
import { formatDuration } from '@/domain/time';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { parseOptionalInt } from '@/features/library/VolumeForm';
import { useRecordingSession } from '@/features/recording/useRecordingSession';
import { transcriptStatusMessage } from '@/features/transcription/statusMessage';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { colors, fonts } = useTheme();
  const load = useCallback(async () => {
    const [volume, prefs] = await Promise.all([getVolume(db, id), getTranscriptionPrefs(db)]);
    return { volume, prefs };
  }, [db, id]);
  const { data } = useFocusLoad(load);
  const volume = data?.volume ?? null;
  const prefs = data?.prefs ?? null;
  const [transcribeOverride, setTranscribeOverride] = useState<boolean | null>(null);
  const transcribeEnabled = transcribeOverride ?? prefs?.live ?? true;
  const allowNetwork = prefs?.allowNetwork ?? false;
  const rec = useRecordingSession(db, id, { enabled: transcribeEnabled, allowNetwork });
  const [page, setPage] = useState('');
  const [pageError, setPageError] = useState<string | undefined>();
  const scroll = useRef<ScrollViewInstance>(null);

  const active = rec.phase === 'recording' || rec.phase === 'paused' || rec.phase === 'starting' || rec.phase === 'stopping';
  const showTranscript = rec.phase !== 'idle' && transcribeEnabled;

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
  const tMessage = transcriptStatusMessage(rec.transcript, allowNetwork, rec.phase === 'paused');
  const tWarn = rec.transcript.status === 'unavailable';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Impossible de quitter l'écran pendant un enregistrement (évite un audio orphelin). */}
      <Stack.Screen options={{ gestureEnabled: !active, headerBackVisible: !active, headerLeft: active ? () => null : undefined }} />
      <View style={styles.container}>
        <Text numberOfLines={2} style={[styles.book, { color: colors.textSecondary, fontFamily: fonts.serif }]}>
          {volume?.title ?? ''}
        </Text>

        <View style={styles.center}>
          <View style={[styles.dot, { backgroundColor: rec.phase === 'recording' && !rec.interrupted ? colors.danger : colors.border }]} />
          <Text style={[showTranscript ? styles.timerSmall : styles.timer, { color: colors.textPrimary }]}>{formatDuration(rec.durationMs)}</Text>
          <Text style={{ color: rec.interrupted ? colors.warning : colors.textMuted }}>{status}</Text>
          {rec.fileSize > 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{(rec.fileSize / 1e6).toFixed(1)} Mo sur l’appareil</Text>
          ) : null}
        </View>

        {showTranscript ? (
          <View style={[styles.transcriptBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {tMessage ? <Text style={{ color: tWarn ? colors.warning : colors.accent, fontSize: 12, marginBottom: 6 }}>{tMessage}</Text> : null}
            <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
              <Text selectable style={[styles.transcript, { color: rec.liveText ? colors.textPrimary : colors.textMuted, fontFamily: fonts.serif }]}>
                {rec.liveText || (tWarn ? '' : 'Parlez… le texte s’affichera ici.')}
              </Text>
            </ScrollView>
          </View>
        ) : null}

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
              <Field label="Page (facultatif)" value={page} onChangeText={setPage} keyboardType="number-pad" error={pageError} />
              <View style={[styles.switchRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Transcription en direct</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {allowNetwork ? 'Français ; en ligne autorisé si nécessaire' : 'Français, sur l’iPhone uniquement'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    L’audio est toujours enregistré. Écran verrouillé, le texte en direct n’est pas garanti : il peut être complété depuis l’audio.
                  </Text>
                </View>
                <Switch value={transcribeEnabled} onValueChange={setTranscribeOverride} />
              </View>
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
              <Button label="Relire et réécouter" onPress={() => router.replace(`/session/${rec.sessionId}`)} big />
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
  container: { flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: 'space-between' },
  book: { fontSize: 18, textAlign: 'center' },
  center: { alignItems: 'center', gap: spacing.xs },
  dot: { width: 14, height: 14, borderRadius: 7 },
  timer: { fontSize: 64, fontWeight: '200', fontVariant: ['tabular-nums'] },
  timerSmall: { fontSize: 40, fontWeight: '200', fontVariant: ['tabular-nums'] },
  transcriptBox: { flex: 1, minHeight: 140, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md },
  transcript: { fontSize: 18, lineHeight: 27 },
  notice: { gap: spacing.md },
  errorText: { textAlign: 'center' },
  controls: { gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
});
