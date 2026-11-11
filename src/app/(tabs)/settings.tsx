import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useDb } from '@/data/db/DatabaseProvider';
import { getTranscriptionPrefs, setTranscriptionPrefs, type TranscriptionPrefs } from '@/data/repositories/settings';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { accentPresets, spacing, type ThemePreference } from '@/theme/tokens';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
];

export default function SettingsScreen() {
  const { colors, preference, setPreference, setAccent } = useTheme();
  const db = useDb();
  const load = useCallback(() => getTranscriptionPrefs(db), [db]);
  const { data: loaded } = useFocusLoad(load);
  const [local, setLocal] = useState<TranscriptionPrefs | null>(null);
  const prefs = local ?? loaded;
  const update = (patch: Partial<TranscriptionPrefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setLocal(next);
    setTranscriptionPrefs(db, next).catch(() => log.warn('settings.save_failed'));
  };
  return (
    <Screen title="Réglages" subtitle="Les autres réglages arriveront avec leurs lots respectifs.">
      <Text style={[styles.section, { color: colors.textSecondary }]}>Thème</Text>
      <View style={styles.row}>
        {THEME_OPTIONS.map((o) => {
          const active = o.value === preference;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setPreference(o.value)}
              style={[styles.chip, { borderColor: active ? colors.accent : colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ color: active ? colors.accent : colors.textPrimary }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.section, { color: colors.textSecondary }]}>Couleur d’accent</Text>
      <View style={styles.row}>
        {accentPresets.map((a) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={() => setAccent(a.value)}
            style={[styles.swatch, { backgroundColor: a.value, borderColor: a.value === colors.accent ? colors.textPrimary : 'transparent' }]}
          />
        ))}
      </View>

      <Text style={[styles.section, { color: colors.textSecondary }]}>Transcription (français)</Text>
      {prefs ? (
        <>
          <View style={[styles.switchRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary }}>Transcription en direct</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Valeur par défaut au début de chaque session.</Text>
            </View>
            <Switch value={prefs.live} onValueChange={(v) => update({ live: v })} />
          </View>
          <View style={[styles.switchRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary }}>Autoriser la reconnaissance en ligne</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Désactivé : la voix est reconnue uniquement sur l’iPhone (hors ligne, rien n’est envoyé). Activé : si le français hors ligne
                n’est pas disponible, iOS peut envoyer l’audio aux serveurs d’Apple pour la reconnaissance.
              </Text>
            </View>
            <Switch value={prefs.allowNetwork} onValueChange={(v) => update({ allowNetwork: v })} />
          </View>
        </>
      ) : null}

      <Text style={[styles.section, { color: colors.textSecondary }]}>Technique</Text>
      <Link href="/diagnostic" asChild>
        <Pressable accessibilityRole="button" style={[styles.button, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Text style={{ color: colors.textPrimary }}>Diagnostic technique</Text>
          <Text style={{ color: colors.textMuted, marginTop: 2 }}>SQLite, stockage privé, micro, reconnaissance vocale</Text>
        </Pressable>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  button: { padding: spacing.lg, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
});
