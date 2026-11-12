import { router } from 'expo-router';
import { useCallback } from 'react';
import { ActionSheetIOS, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoverArt, coverShade } from '@/components/CoverArt';
import { SeriesCover } from '@/components/SeriesCover';
import { Button, EmptyState, SectionTitle } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { loadLibrary, type LibraryItem } from '@/data/repositories/library';
import type { VolumeWithStats } from '@/data/repositories/volumes';
import { VOLUME_STATUS_LABELS } from '@/domain/models';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const COLUMNS = 3;

function openAddMenu() {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: ['Rechercher un livre', 'Saisir un livre à la main', 'Nouvelle série', 'Annuler'],
      cancelButtonIndex: 3,
      title: 'Ajouter à la bibliothèque',
    },
    (i) => {
      if (i === 0) router.push('/search');
      if (i === 1) router.push('/volume/new');
      if (i === 2) router.push('/series/new');
    },
  );
}

export default function LibraryScreen() {
  const db = useDb();
  const { colors, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const load = useCallback(() => loadLibrary(db), [db]);
  const { data: library, failed } = useFocusLoad(load);

  const gap = spacing.md;
  const cardWidth = Math.floor((width - spacing.lg * 2 - gap * (COLUMNS - 1)) / COLUMNS);
  const items = library?.items ?? [];
  const seriesCount = items.filter((i) => i.kind === 'series').length;

  const header = (
    <View>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.brand, { color: colors.textPrimary, fontFamily: fonts.serif }]}>Lecture sucrée</Text>
          {library?.volumeCount ? (
            <Text style={{ color: colors.textMuted }}>
              {library.volumeCount} livre{library.volumeCount > 1 ? 's' : ''}
              {seriesCount ? ` · ${seriesCount} série${seriesCount > 1 ? 's' : ''}` : ''}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter un livre ou une série"
          onPress={openAddMenu}
          style={[styles.add, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.addText}>＋</Text>
        </Pressable>
      </View>

      {library?.featured ? <Featured volume={library.featured} /> : null}
      {items.length > 0 ? <SectionTitle>Ma bibliothèque</SectionTitle> : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ListEmptyComponent={
          failed ? (
            <EmptyState title="Erreur de lecture" text="La bibliothèque n’a pas pu être chargée. Réessayez en revenant sur cet écran." />
          ) : library ? (
            <View style={{ gap: spacing.sm }}>
              <EmptyState
                title="Votre bibliothèque est vide"
                text="Ajoutez un livre, ou créez une série pour y ranger ses tomes."
              />
              <Button label="Rechercher un livre" onPress={() => router.push('/search')} big />
              <Button label="Saisir un livre à la main" variant="secondary" onPress={() => router.push('/volume/new')} />
              <Button label="Créer une série" variant="secondary" onPress={() => router.push('/series/new')} />
            </View>
          ) : undefined
        }
        renderItem={({ item }) => <LibraryTile item={item} width={cardWidth} />}
      />
    </SafeAreaView>
  );
}

function LibraryTile({ item, width }: { item: LibraryItem; width: number }) {
  const { colors } = useTheme();
  if (item.kind === 'series') {
    const s = item.series;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Série ${s.title}, ${s.volumeCount} tomes`}
        onPress={() => router.push(`/series/${s.id}`)}
        style={({ pressed }) => [{ width, marginBottom: spacing.lg, opacity: pressed ? 0.75 : 1 }]}
      >
        <SeriesCover title={s.title} author={s.author} coverPath={s.displayCoverPath} volumeCount={s.volumeCount} width={width} />
        <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.textPrimary }]}>
          {s.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
          {s.volumeCount} tome{s.volumeCount > 1 ? 's' : ''}
          {s.readingCount ? ` · ${s.readingCount} en cours` : ''}
        </Text>
      </Pressable>
    );
  }
  const v = item.volume;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/volume/${v.id}`)}
      style={({ pressed }) => [{ width, marginBottom: spacing.lg, opacity: pressed ? 0.75 : 1 }]}
    >
      <CoverArt title={v.title} author={v.author} label={v.volumeLabel} width={width} coverPath={v.coverPath} />
      <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.textPrimary }]}>
        {v.title}
      </Text>
      <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
        {v.sessionCount ? `${v.sessionCount} session${v.sessionCount > 1 ? 's' : ''}` : VOLUME_STATUS_LABELS[v.status]}
      </Text>
    </Pressable>
  );
}

function Featured({ volume }: { volume: VolumeWithStats }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/volume/${volume.id}`)}
      style={[styles.featured, { backgroundColor: coverShade(volume.title), borderColor: colors.border }]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: 0.55 }]} />
      <CoverArt title={volume.title} author={volume.author} label={volume.volumeLabel} width={104} coverPath={volume.coverPath} />
      <View style={styles.featuredText}>
        <Text style={[styles.kicker, { color: colors.accent }]}>{volume.status === 'reading' ? 'EN COURS' : 'RÉCEMMENT'}</Text>
        <Text numberOfLines={3} style={[styles.featuredTitle, { color: colors.textPrimary, fontFamily: fonts.serif }]}>
          {volume.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary }}>
          {volume.author}
          {volume.volumeLabel ? ` · ${volume.volumeLabel}` : ''}
        </Text>
        {volume.pageCount ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[styles.progressFill, { backgroundColor: colors.accent, width: `${Math.min(100, (volume.currentPage / volume.pageCount) * 100)}%` }]}
            />
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/volume/${volume.id}/record`)}
          style={[styles.recordPill, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.recordPillText}>● Nouvelle session</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.lg },
  brand: { fontSize: 32, fontWeight: '700' },
  add: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#0B0A0F', fontSize: 24, fontWeight: '700', marginTop: -2 },
  featured: { flexDirection: 'row', gap: spacing.lg, padding: spacing.lg, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  featuredText: { flex: 1, gap: 4, justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  featuredTitle: { fontSize: 20, fontWeight: '700', lineHeight: 24 },
  progressTrack: { height: 3, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: 3 },
  recordPill: { alignSelf: 'flex-start', marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: 999 },
  recordPillText: { color: '#0B0A0F', fontWeight: '700', fontSize: 13 },
  cardTitle: { marginTop: 6, fontSize: 13, fontWeight: '600' },
});
