import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { coverUri } from '@/features/covers/coverStore';
import { useTheme } from '@/theme/ThemeProvider';
import { COVER_RATIO, radius } from '@/theme/tokens';

/**
 * Couverture d'un tome ou d'une série.
 * - Image importée si elle existe dans le stockage privé.
 * - Sinon (ou si l'image est illisible) : couverture typographique générée,
 *   couleur profonde déterministe dérivée du titre, titre en serif.
 * `pendingUri` affiche une image choisie mais pas encore enregistrée.
 */
const SHADES = ['#2B1B3D', '#3A1F2B', '#1E2A3F', '#173A35', '#3B2A17', '#2A2F1A', '#3D1A1A', '#1F2033', '#33263F', '#14303A'];

export function coverShade(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  return SHADES[Math.abs(h) % SHADES.length] ?? SHADES[0]!;
}

export function CoverArt({
  title,
  author,
  label,
  width,
  coverPath,
  pendingUri,
}: {
  title: string;
  author?: string | null;
  label?: string | null;
  width: number;
  coverPath?: string | null;
  pendingUri?: string | null;
}) {
  const { colors, fonts } = useTheme();
  const height = width / COVER_RATIO;
  const big = width >= 140;
  const uri = useMemo(() => pendingUri ?? coverUri(coverPath), [pendingUri, coverPath]);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = !!uri && uri !== failedUri;

  return (
    <View
      accessible
      accessibilityLabel={author ? `${title}, ${author}` : title}
      style={[styles.cover, { width, height, backgroundColor: coverShade(title) }]}
    >
      {showImage ? (
        <>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailedUri(uri)} />
          <View style={styles.imageEdge} />
        </>
      ) : (
        <>
          <View style={[styles.spine, { backgroundColor: colors.accent }]} />
          <View style={styles.sheen} />
          <View style={styles.inner}>
            {label ? (
              <Text style={[styles.label, { color: colors.accent, fontSize: big ? 12 : 9 }]} numberOfLines={1}>
                {label}
              </Text>
            ) : (
              <View />
            )}
            <Text
              style={[styles.title, { fontFamily: fonts.serif, fontSize: big ? 22 : 13, lineHeight: big ? 26 : 16 }]}
              numberOfLines={big ? 5 : 4}
            >
              {title}
            </Text>
            <Text style={[styles.author, { fontSize: big ? 11 : 8 }]} numberOfLines={2}>
              {(author ?? '').toUpperCase()}
            </Text>
          </View>
          <View style={styles.shade} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: radius.cover, overflow: 'hidden' },
  imageEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.cover,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, opacity: 0.9 },
  sheen: { position: 'absolute', left: 3, right: 0, top: 0, height: '38%', backgroundColor: 'rgba(255,255,255,0.05)' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '22%', backgroundColor: 'rgba(0,0,0,0.25)' },
  inner: { flex: 1, padding: '10%', paddingLeft: '14%', justifyContent: 'space-between', zIndex: 1 },
  label: { fontWeight: '700', letterSpacing: 1 },
  title: { color: '#F4EEE4', fontWeight: '700' },
  author: { color: 'rgba(244,238,228,0.75)', letterSpacing: 1.2, fontWeight: '600' },
});
