import { requestRecordingPermissionsAsync } from 'expo-audio';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { runDiagnostics, type CheckResult, type CheckStatus } from '@/features/diagnostic/runDiagnostics';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const ICON: Record<CheckStatus, string> = { ok: '✓', warn: '!', fail: '✗', info: 'i' };

export default function DiagnosticScreen() {
  const { colors } = useTheme();
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [busy, setBusy] = useState(true);

  const collect = useCallback(async () => {
    try {
      const r = await runDiagnostics();
      setResults(r);
      log.info('diagnostic.done', { ok: r.filter((x) => x.status === 'ok').length, fail: r.filter((x) => x.status === 'fail').length });
    } finally {
      setBusy(false);
    }
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    await collect();
  }, [collect]);

  useEffect(() => {
    // Premier passage : busy vaut déjà true, aucun setState synchrone ici.
    void collect();
  }, [collect]);

  const tone = (s: CheckStatus) =>
    s === 'ok' ? colors.success : s === 'fail' ? colors.danger : s === 'warn' ? colors.warning : colors.textMuted;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={{ color: colors.textSecondary }}>
        Vérifie les briques natives sur cet appareil. Aucune donnée personnelle n’est lue.
      </Text>
      {busy && !results ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} /> : null}
      {results?.map((r) => (
        <View key={r.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            <Text style={{ color: tone(r.status) }}>{ICON[r.status]} </Text>
            {r.label}
          </Text>
          <Text selectable style={{ color: colors.textSecondary, marginTop: 4 }}>
            {r.detail}
          </Text>
        </View>
      ))}
      <View style={styles.actions}>
        <Action label="Relancer" onPress={run} />
        <Action
          label="Autoriser le micro"
          onPress={async () => {
            await requestRecordingPermissionsAsync();
            await run();
          }}
        />
        <Action
          label="Autoriser la reconnaissance vocale"
          onPress={async () => {
            await ExpoSpeechRecognitionModule.requestPermissionsAsync();
            await run();
          }}
        />
      </View>
    </ScrollView>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void | Promise<void> }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void onPress()}
      style={[styles.action, { borderColor: colors.accent }]}
    >
      <Text style={{ color: colors.accent, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { padding: spacing.lg, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  cardTitle: { fontWeight: '600', fontSize: 15 },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  action: { padding: spacing.md, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
});
