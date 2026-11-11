import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverArt, coverShade } from '@/components/CoverArt';
import { SeriesCover } from '@/components/SeriesCover';
import { Button, EmptyState, SectionTitle } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { getSeries, removeSeries } from '@/data/repositories/series';
import { listVolumesInSeries } from '@/data/repositories/volumes';
import { VOLUME_STATUS_LABELS } from '@/domain/models';
import { discardCover } from '@/features/covers/coverStore';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [removing, setRemoving] = useState(false);
  const load = useCallback(async () => {
    const [series, volumes] = await Promise.all([getSeries(db, id), listVolumesInSeries(db, id)]);
    return { series, volumes };
  }, [db, id]);
  const { data, failed } = useFocusLoad(load);

  if (failed) return <EmptyState title="Erreur" text="Impossible de charger cette série." />;
  if (!data) return null;
  const { series, volumes } = data;
  if (!series) return <EmptyState title="Série introuvable" text="Cette série a été supprimée." />;

  const heroCover = series.coverPath ?? volumes.find((v) => v.coverPath)?.coverPath ?? null;
  const finished = volumes.filter((v) => v.status === 'finished').length;
  const cardWidth = Math.floor((width - spacing.lg * 2 - spacing.md * 2) / 3);

  const confirmRemove = () => {
    Alert.alert(
      'Supprimer la série ?',
      volumes.length
        ? `Seule la série « ${series.title} » est supprimée.\n\nSes ${volumes.length} tome${volumes.length > 1 ? 's' : ''} ne sont PAS supprimés : ils restent dans la bibliothèque comme livres indépendants, avec toutes leurs sessions et enregistrements audio.`
        : 'La série est vide. Elle sera simplement supprimée.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer la série',
          style: 'destructive',
          onPress: () => {
            setRemoving(true);
            removeSeries(db, series.id, new Date().toISOString())
              .then(() => {
                discardCover(series.coverPath); // copie privée de la couverture de la série uniquement
                router.back();
              })
              .catch((e: unknown) => {
                log.error('series.remove_failed', { kind: e instanceof Error ? e.name : 'unknown' });
                setRemoving(false);
                Alert.alert('Échec', 'La série n’a pas pu être supprimée. Rien n’a été modifié.');
              });
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={[styles.hero, { backgroundColor: coverShade(series.title), paddingTop: insets.top + 56 }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: 0.35 }]} />
        <View style={[styles.heroFade, { backgroundColor: colors.background }]} />
        <SeriesCover title={series.title} author={series.author} coverPath={heroCover} volumeCount={volumes.length} width={160} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.kicker, { color: colors.accent }]}>SÉRIE</Text>
        <Text style={[styles.title, { color: colors.textPrimary, fontFamily: fonts.serif }]}>{series.title}</Text>
        {series.author ? <Text style={[styles.author, { color: colors.textSecondary }]}>{series.author}</Text> : null}
        <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
          {volumes.length} tome{volumes.length > 1 ? 's' : ''}
          {volumes.length ? ` · ${finished} terminé${finished > 1 ? 's' : ''}` : ''}
        </Text>

        <View style={styles.actions}>
          <Button label="＋ Ajouter un tome" onPress={() => router.push(`/volume/new?seriesId=${series.id}`)} big />
          <Button label="Modifier la série" variant="secondary" onPress={() => router.push(`/series/${series.id}/edit`)} />
        </View>

        {series.description ? <Text style={[styles.description, { color: colors.textSecondary }]}>{series.description}</Text> : null}

        <SectionTitle>Tomes</SectionTitle>
        {volumes.length === 0 ? (
          <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>
            Aucun tome pour l’instant. Ajoutez-en un, ou rattachez un livre existant depuis sa fiche (« Modifier la fiche » › Série).
          </Text>
        ) : (
          <View style={styles.grid}>
            {volumes.map((v) => (
              <Pressable
                key={v.id}
                accessibilityRole="button"
                onPress={() => router.push(`/volume/${v.id}`)}
                style={({ pressed }) => [{ width: cardWidth, opacity: pressed ? 0.75 : 1 }]}
              >
                <CoverArt title={v.title} author={v.author} label={v.volumeLabel} width={cardWidth} coverPath={v.coverPath} />
                <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  {v.volumeLabel ? `${v.volumeLabel} · ` : ''}
                  {v.title}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
                  {VOLUME_STATUS_LABELS[v.status]}
                  {v.sessionCount ? ` · ${v.sessionCount} session${v.sessionCount > 1 ? 's' : ''}` : ''}
                </Text>
                {v.pageCount ? (
                  <View style={[styles.track, { backgroundColor: colors.border }]}>
                    <View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.min(100, (v.currentPage / v.pageCount) * 100)}%` }]} />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.danger}>
          <Button label="Supprimer la série" variant="secondary" onPress={confirmRemove} busy={removing} />
          <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
            Les tomes deviennent indépendants ; leurs sessions et audios ne sont jamais supprimés.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: spacing.xl, overflow: 'hidden' },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '35%', opacity: 0.9 },
  body: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center' },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34, textAlign: 'center' },
  author: { fontSize: 16, textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  description: { marginTop: spacing.md, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  cardTitle: { marginTop: 6, fontSize: 13, fontWeight: '600' },
  track: { height: 3, borderRadius: radius.sm, marginTop: 4, overflow: 'hidden' },
  fill: { height: 3 },
  danger: { marginTop: spacing.xxl, gap: spacing.sm },
});
