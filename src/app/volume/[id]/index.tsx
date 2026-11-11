import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverArt, coverShade } from '@/components/CoverArt';
import { SessionRow } from '@/components/SessionRow';
import { Button, EmptyState, SectionTitle } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { listSessionsForVolume } from '@/data/repositories/sessions';
import { getVolume } from '@/data/repositories/volumes';
import { VOLUME_STATUS_LABELS } from '@/domain/models';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export default function VolumeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const load = useCallback(async () => {
    const [volume, sessions] = await Promise.all([getVolume(db, id), listSessionsForVolume(db, id)]);
    return { volume, sessions };
  }, [db, id]);
  const { data, failed } = useFocusLoad(load);

  if (failed) return <EmptyState title="Erreur" text="Impossible de charger ce livre." />;
  if (!data) return null;
  const { volume, sessions } = data;
  if (!volume) return <EmptyState title="Livre introuvable" text="Ce livre n’existe plus." />;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={[styles.hero, { backgroundColor: coverShade(volume.title), paddingTop: insets.top + 56 }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: 0.35 }]} />
        <View style={[styles.heroFade, { backgroundColor: colors.background }]} />
        <CoverArt title={volume.title} author={volume.author} label={volume.volumeLabel} width={150} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary, fontFamily: fonts.serif }]}>{volume.title}</Text>
        <Text style={[styles.author, { color: colors.textSecondary }]}>
          {volume.author}
          {volume.volumeLabel ? ` · ${volume.volumeLabel}` : ''}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.badge, { color: colors.accent, borderColor: colors.accent }]}>{VOLUME_STATUS_LABELS[volume.status]}</Text>
          {volume.pageCount ? (
            <Text style={{ color: colors.textMuted }}>
              page {volume.currentPage} / {volume.pageCount}
            </Text>
          ) : volume.currentPage ? (
            <Text style={{ color: colors.textMuted }}>page {volume.currentPage}</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button label="● Nouvelle session" onPress={() => router.push(`/volume/${volume.id}/record`)} big />
          <Button label="Modifier la fiche" variant="secondary" onPress={() => router.push(`/volume/${volume.id}/edit`)} />
        </View>

        {volume.description ? <Text style={[styles.description, { color: colors.textSecondary }]}>{volume.description}</Text> : null}

        <SectionTitle>
          Sessions{sessions.length ? ` (${sessions.length})` : ''}
        </SectionTitle>
        {sessions.length === 0 ? (
          <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>
            Aucune session pour l’instant. Lancez-en une pour dicter vos réflexions.
          </Text>
        ) : (
          sessions.map((s) => <SessionRow key={s.id} session={s} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: spacing.xl, overflow: 'hidden' },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '35%', opacity: 0.9 },
  body: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34, textAlign: 'center' },
  author: { fontSize: 16, textAlign: 'center' },
  metaRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontWeight: '700' },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  description: { marginTop: spacing.md, lineHeight: 22 },
});
