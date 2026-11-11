import { router } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoverArt, coverShade } from '@/components/CoverArt';
import { Button, EmptyState, SectionTitle } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { listVolumes, type VolumeWithStats } from '@/data/repositories/volumes';
import { VOLUME_STATUS_LABELS } from '@/domain/models';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const COLUMNS = 3;

export default function LibraryScreen() {
  const db = useDb();
  const { colors, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const load = useCallback(() => listVolumes(db), [db]);
  const { data: volumes, failed } = useFocusLoad(load);

  const gap = spacing.md;
  const cardWidth = Math.floor((width - spacing.lg * 2 - gap * (COLUMNS - 1)) / COLUMNS);
  const featured = volumes?.find((v) => v.status === 'reading') ?? volumes?.[0];

  const header = (
    <View>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.brand, { color: colors.textPrimary, fontFamily: fonts.serif }]}>Lecture sucrée</Text>
          {volumes?.length ? (
            <Text style={{ color: colors.textMuted }}>
              {volumes.length} livre{volumes.length > 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter un livre"
          onPress={() => router.push('/volume/new')}
          style={[styles.add, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.addText}>＋</Text>
        </Pressable>
      </View>

      {featured ? <Featured volume={featured} /> : null}
      {volumes && volumes.length > 0 ? <SectionTitle>Ma bibliothèque</SectionTitle> : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={volumes ?? []}
        keyExtractor={(v) => v.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ListEmptyComponent={
          failed ? (
            <EmptyState title="Erreur de lecture" text="La bibliothèque n’a pas pu être chargée. Réessayez en revenant sur cet écran." />
          ) : volumes ? (
            <View>
              <EmptyState
                title="Votre bibliothèque est vide"
                text="Ajoutez votre premier livre, puis lancez une session pour dicter vos réflexions."
              />
              <Button label="Ajouter un livre" onPress={() => router.push('/volume/new')} big />
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/volume/${item.id}`)}
            style={({ pressed }) => [{ width: cardWidth, marginBottom: spacing.lg, opacity: pressed ? 0.75 : 1 }]}
          >
            <CoverArt title={item.title} author={item.author} label={item.volumeLabel} width={cardWidth} />
            <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.textPrimary }]}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
              {item.sessionCount ? `${item.sessionCount} session${item.sessionCount > 1 ? 's' : ''}` : VOLUME_STATUS_LABELS[item.status]}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
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
      <CoverArt title={volume.title} author={volume.author} label={volume.volumeLabel} width={104} />
      <View style={styles.featuredText}>
        <Text style={[styles.kicker, { color: colors.accent }]}>
          {volume.status === 'reading' ? 'EN COURS' : 'RÉCEMMENT'}
        </Text>
        <Text numberOfLines={3} style={[styles.featuredTitle, { color: colors.textPrimary, fontFamily: fonts.serif }]}>
          {volume.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary }}>
          {volume.author}
        </Text>
        {volume.pageCount ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.accent, width: `${Math.min(100, (volume.currentPage / volume.pageCount) * 100)}%` },
              ]}
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
  featured: {
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  featuredText: { flex: 1, gap: 4, justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  featuredTitle: { fontSize: 20, fontWeight: '700', lineHeight: 24 },
  progressTrack: { height: 3, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: 3 },
  recordPill: { alignSelf: 'flex-start', marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: 999 },
  recordPillText: { color: '#0B0A0F', fontWeight: '700', fontSize: 13 },
  cardTitle: { marginTop: 6, fontSize: 13, fontWeight: '600' },
});
