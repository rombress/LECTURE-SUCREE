import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { COVER_RATIO, radius } from '@/theme/tokens';

import { CoverArt, coverShade } from './CoverArt';

/**
 * Couverture de série : couverture principale posée sur une pile de deux
 * « tomes » décalés, avec le nombre de tomes en pastille.
 */
export function SeriesCover({
  title,
  author,
  coverPath,
  volumeCount,
  width,
}: {
  title: string;
  author?: string | null;
  coverPath?: string | null;
  volumeCount: number;
  width: number;
}) {
  const { colors } = useTheme();
  const offset = Math.max(3, Math.round(width * 0.045));
  const inner = width - offset * 2;
  const height = inner / COVER_RATIO;
  const shade = coverShade(title);
  return (
    <View style={{ width, height: height + offset * 2 }}>
      <View
        style={[styles.layer, { left: offset * 2, top: 0, width: inner, height, backgroundColor: shade, opacity: 0.45, borderColor: colors.border }]}
      />
      <View
        style={[styles.layer, { left: offset, top: offset, width: inner, height, backgroundColor: shade, opacity: 0.75, borderColor: colors.border }]}
      />
      <View style={{ position: 'absolute', left: 0, top: offset * 2 }}>
        <CoverArt title={title} author={author} label="SÉRIE" width={inner} coverPath={coverPath} />
      </View>
      <View style={[styles.badge, { backgroundColor: colors.accent }]}>
        <Text style={styles.badgeText}>{volumeCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', borderRadius: radius.cover, borderWidth: StyleSheet.hairlineWidth },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#0B0A0F', fontWeight: '800', fontSize: 12 },
});
