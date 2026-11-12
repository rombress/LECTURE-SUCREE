import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, EmptyState } from '@/components/ui';
import { CandidateRow } from '@/features/bookSearch/CandidateRow';
import { isHiddenByDefault } from '@/features/bookSearch/rank';
import { searchBooks, type SearchResult } from '@/features/bookSearch/search';
import { appHttp, searchSession } from '@/features/bookSearch/session';
import { SOURCE_LABELS, type BookSource } from '@/features/bookSearch/types';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export default function SearchBooksScreen() {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    const q = query.trim();
    if (!q || busy) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setFailed(false);
    setSelected([]);
    try {
      const r = await searchBooks(q, appHttp(), ctrl.signal);
      searchSession.remember(r.candidates);
      setResult(r);
      log.info('book_search.done', { kept: r.candidates.length, offline: r.offline });
    } catch {
      if (!ctrl.signal.aborted) {
        setFailed(true);
        log.warn('book_search.failed');
      }
    } finally {
      if (abortRef.current === ctrl) setBusy(false);
    }
  };

  const visible = useMemo(() => (result?.candidates ?? []).filter((c) => showAll || !isHiddenByDefault(c)), [result, showAll]);
  const hiddenCount = (result?.candidates.length ?? 0) - (result?.candidates.filter((c) => !isHiddenByDefault(c)).length ?? 0);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const sourceLine = result
    ? (Object.entries(result.status) as [BookSource, NonNullable<SearchResult['status'][BookSource]>][])
        .map(([src, st]) =>
          st.state === 'ok'
            ? `${SOURCE_LABELS[src]} : ${st.kept} retenu${st.kept > 1 ? 's' : ''}${st.truncated ? ' (premiers résultats seulement)' : ''}`
            : `${SOURCE_LABELS[src]} : ${st.message}`,
        )
        .join(' · ')
    : null;

  const header = (
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Titre, auteur ou ISBN"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoFocus
          autoCorrect={false}
          onSubmitEditing={() => void run()}
          accessibilityLabel="Rechercher un livre"
          style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
        />
        <Button label="Chercher" onPress={() => void run()} busy={busy} disabled={!query.trim()} />
      </View>
      {sourceLine ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{sourceLine}</Text> : null}
      {result && result.candidates.length > 0 ? (
        <View style={styles.chips}>
          <Chip label={showAll ? 'Tous les formats' : `Light novels et non précisés${hiddenCount ? ` (${hiddenCount} masqués)` : ''}`} selected={!showAll} onPress={() => setShowAll((v) => !v)} />
          <Chip
            label="Ajouter plusieurs tomes"
            selected={multi}
            onPress={() => {
              setMulti((m) => !m);
              setSelected([]);
            }}
          />
        </View>
      ) : null}
      {multi ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          Cochez les tomes à ajouter. Rien n’est ajouté sans votre confirmation à l’étape suivante.
        </Text>
      ) : null}
    </View>
  );

  let empty: React.ReactElement | undefined;
  if (busy && !result) empty = <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.textSecondary} />;
  else if (failed) empty = <EmptyState title="Recherche impossible" text="Une erreur inattendue s’est produite. Réessayez." />;
  else if (result?.offline)
    empty = (
      <View style={{ gap: spacing.md }}>
        <EmptyState title="Pas de connexion" text="La recherche a besoin d’Internet. Vos livres restent consultables, et l’ajout manuel fonctionne hors ligne." />
        <Button label="Ajouter à la main" variant="secondary" onPress={() => router.replace('/volume/new')} />
      </View>
    );
  else if (result && visible.length === 0)
    empty = (
      <View style={{ gap: spacing.md }}>
        <EmptyState
          title="Aucun résultat"
          text={
            hiddenCount
              ? `Aucun light novel trouvé. ${hiddenCount} autre${hiddenCount > 1 ? 's' : ''} résultat${hiddenCount > 1 ? 's' : ''} (mangas, autres formats) masqué${hiddenCount > 1 ? 's' : ''}.`
              : 'Essayez le titre original, le titre anglais, le nom de l’auteur ou l’ISBN. Les catalogues ne contiennent pas tous les livres.'
          }
        />
        <Button label="Ajouter à la main" variant="secondary" onPress={() => router.replace('/volume/new')} />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <CandidateRow
            c={item}
            selectable={multi}
            selected={selected.includes(item.id)}
            onPress={() => (multi ? toggle(item.id) : router.push({ pathname: '/search/edition', params: { id: item.id } }))}
          />
        )}
        ListFooterComponent={
          result && result.candidates.length > 0 ? (
            <Text style={[styles.credits, { color: colors.textMuted }]}>
              Données bibliographiques : Bibliothèque nationale de France (catalogue général, Licence Ouverte) et Open Library (Internet
              Archive). Les catalogues peuvent être incomplets : un tome absent ici n’est pas forcément inexistant.
            </Text>
          ) : undefined
        }
      />
      {multi && selected.length > 0 ? (
        <View style={[styles.footer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Button
            label={`Vérifier ${selected.length} tome${selected.length > 1 ? 's' : ''}`}
            big
            onPress={() => {
              searchSession.setSelection(selected);
              router.push('/search/batch');
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: 140 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  credits: { fontSize: 11, lineHeight: 16, marginTop: spacing.xl },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth },
});
