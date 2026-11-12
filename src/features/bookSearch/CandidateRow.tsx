import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { COVER_RATIO, radius, spacing } from '@/theme/tokens';

import { bnfCoverUrl } from './bnf';
import { FORMAT_LABELS, languageLabel, SOURCE_LABELS, type BookCandidate } from './types';

/** Vignette : couverture connue, sinon miniature BnF de CETTE notice (absente → cadre vide). */
function thumbUrl(c: BookCandidate): string | null {
  if (c.coverUrl && c.coverSource === 'openlibrary') return c.coverUrl.replace('-L.jpg', '-M.jpg');
  if (c.bnfArk && c.bnfCoverFlag) return bnfCoverUrl(c.bnfArk, 'thumb');
  return c.coverUrl;
}

/** Une édition trouvée : langue, édition, format et tome toujours visibles. */
export function CandidateRow({
  c,
  selected,
  selectable,
  note,
  onPress,
}: {
  c: BookCandidate;
  selected?: boolean;
  selectable?: boolean;
  note?: string | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thumbFailed ? null : thumbUrl(c);
  const width = 52;
  const volume = c.volume ? `Tome ${c.volume.label}${c.volume.confident ? '' : ' (?)'}` : 'Tome non indiqué';
  const kind =
    c.volume?.kind === 'omnibus' ? ' · intégrale/coffret' : c.volume?.kind === 'special' ? ' · hors-série' : c.volume?.kind === 'decimal' ? ' · tome intermédiaire' : '';
  return (
    <Pressable
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: !!selected } : undefined}
      accessibilityLabel={`${c.title}, ${volume}, ${languageLabel(c.language)}, ${c.publisher ?? 'éditeur inconnu'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: selected ? colors.surfaceRaised : colors.surface, borderColor: selected ? colors.textSecondary : colors.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {selectable ? (
        <View style={[styles.check, { borderColor: colors.textSecondary, backgroundColor: selected ? colors.textPrimary : 'transparent' }]}>
          {selected ? <Text style={{ color: colors.background, fontWeight: '800' }}>✓</Text> : null}
        </View>
      ) : null}
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          onError={() => setThumbFailed(true)}
          style={{ width, height: width / COVER_RATIO, borderRadius: radius.sm, backgroundColor: colors.border }}
        />
      ) : (
        <View style={[styles.noCover, { width, height: width / COVER_RATIO, borderColor: colors.border }]}>
          <Text style={{ color: colors.textMuted, fontSize: 9, textAlign: 'center' }}>sans couverture</Text>
        </View>
      )}
      <View style={styles.text}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.textPrimary }]}>
          {c.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13 }}>
          {volume}
          {kind}
          {c.seriesTitle ? ` · ${c.seriesTitle}` : ''}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13 }}>
          {languageLabel(c.language)} · {c.publisher ?? 'éditeur inconnu'}
          {c.publishedYear ? ` · ${c.publishedYear}` : ''}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
          {FORMAT_LABELS[c.format]} · {c.pageCount ? `${c.pageCount} p.` : 'pages ?'} · {c.sources.map((s) => SOURCE_LABELS[s]).join(' + ')}
        </Text>
        {note ? <Text style={{ color: colors.warning, fontSize: 12 }}>{note}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  noCover: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', padding: 2 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600' },
});
