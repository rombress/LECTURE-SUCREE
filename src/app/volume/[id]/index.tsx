import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverArt, coverShade } from '@/components/CoverArt';
import { SessionRow } from '@/components/SessionRow';
import { Button, EmptyState, SectionTitle } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { getSeries } from '@/data/repositories/series';
import { listSessionsForVolume, type SessionSummary } from '@/data/repositories/sessions';
import { getVolume } from '@/data/repositories/volumes';
import { VOLUME_STATUS_LABELS } from '@/domain/models';
import { formatDuration } from '@/domain/time';
import { discardCover } from '@/features/covers/coverStore';
import { confirmDestructive, confirmSessionDeletion, showDeletionError } from '@/features/deletion/confirm';
import { DeletionError, deleteSession, deleteVolume, summarizeVolumeDeletion } from '@/features/deletion/deletion';
import { deviceTrashOps } from '@/features/deletion/deviceTrash';
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
    const series = volume?.seriesId ? await getSeries(db, volume.seriesId) : null;
    return { volume, sessions, series };
  }, [db, id]);
  const { data, failed, reload } = useFocusLoad(load);
  const [deleting, setDeleting] = useState(false);

  const onDeleteSession = async (s: SessionSummary) => {
    if (!(await confirmSessionDeletion(s))) return;
    try {
      await deleteSession(db, deviceTrashOps, s.id);
    } catch (e) {
      showDeletionError(e);
    }
    reload();
  };

  const onDeleteVolume = async () => {
    const v = data?.volume;
    if (!v) return;
    const sum = await summarizeVolumeDeletion(db, v.id);
    if (sum.activeCount > 0) {
      showDeletionError(new DeletionError('active', 'Un enregistrement est en cours sur ce livre. Terminez-le avant de supprimer le livre.'));
      return;
    }
    const first = await confirmDestructive(
      'Supprimer ce livre ?',
      sum.sessionCount === 0
        ? `« ${v.title} » sera supprimé de la bibliothèque. Il n’a aucune session.`
        : `« ${v.title} » a ${sum.sessionCount} session${sum.sessionCount > 1 ? 's' : ''} (${formatDuration(sum.totalDurationMs)} au total)` +
            `${sum.audioCount ? ` et ${sum.audioCount} enregistrement${sum.audioCount > 1 ? 's' : ''} audio` : ''}.\n\n` +
            'Elles seront DÉFINITIVEMENT supprimées avec le livre. Exportez d’abord les audios à conserver.\n\n' +
            'Les autres livres, tomes et séries ne sont pas touchés.',
      'Supprimer…',
    );
    if (!first) return;
    if (sum.sessionCount > 0) {
      const second = await confirmDestructive(
        'Confirmer la suppression définitive',
        `${sum.sessionCount} session${sum.sessionCount > 1 ? 's' : ''} et leurs audios seront effacés. Cette action est irréversible.`,
        'Tout supprimer',
      );
      if (!second) return;
    }
    setDeleting(true);
    try {
      const { coverPath } = await deleteVolume(db, deviceTrashOps, v.id);
      discardCover(coverPath);
      router.back();
    } catch (e) {
      setDeleting(false);
      showDeletionError(e);
      reload();
    }
  };

  if (failed) return <EmptyState title="Erreur" text="Impossible de charger ce livre." />;
  if (!data) return null;
  const { volume, sessions, series } = data;
  if (!volume) return <EmptyState title="Livre introuvable" text="Ce livre n’existe plus." />;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={[styles.hero, { backgroundColor: coverShade(volume.title), paddingTop: insets.top + 56 }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: 0.35 }]} />
        <View style={[styles.heroFade, { backgroundColor: colors.background }]} />
        <CoverArt title={volume.title} author={volume.author} label={volume.volumeLabel} width={150} coverPath={volume.coverPath} />
      </View>
      {volume.coverPath && volume.coverCredit ? (
        <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingHorizontal: spacing.lg }}>{volume.coverCredit}</Text>
      ) : null}

      <View style={styles.body}>
        {series ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/series/${series.id}`)}>
            <Text style={[styles.seriesLink, { color: colors.accent }]}>
              {series.title.toUpperCase()}
              {volume.volumeLabel ? ` · ${volume.volumeLabel.toUpperCase()}` : ''} ›
            </Text>
          </Pressable>
        ) : null}
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
          <>
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} onDelete={(x) => void onDeleteSession(x)} />
            ))}
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.xs }}>
              Appui long sur une session pour la supprimer.
            </Text>
          </>
        )}

        <View style={styles.danger}>
          <Button label="Supprimer ce livre" variant="secondary" onPress={() => void onDeleteVolume()} busy={deleting} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: spacing.xl, overflow: 'hidden' },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '35%', opacity: 0.9 },
  body: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  seriesLink: { textAlign: 'center', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34, textAlign: 'center' },
  author: { fontSize: 16, textAlign: 'center' },
  metaRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontWeight: '700' },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  description: { marginTop: spacing.md, lineHeight: 22 },
  danger: { marginTop: spacing.xxl },
});
