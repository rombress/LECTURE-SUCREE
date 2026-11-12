import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, EmptyState, Field, SectionTitle } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { listSeries } from '@/data/repositories/series';
import { CandidateRow } from '@/features/bookSearch/CandidateRow';
import { duplicatesWithinSelection, findDuplicate, loadExistingKeys, type ExistingVolumeKey } from '@/features/bookSearch/duplicates';
import { importBatch, sortForImport, type BatchImportReport, type SeriesChoice } from '@/features/bookSearch/importBooks';
import { enrichCandidate, OL_SPACING_MS } from '@/features/bookSearch/search';
import { appHttp, searchSession } from '@/features/bookSearch/session';
import { normalizeForMatch } from '@/features/bookSearch/text';
import { languageLabel, type BookCandidate } from '@/features/bookSearch/types';
import { discardCover, downloadCover, persistCover } from '@/features/covers/coverStore';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const isLatin = (s: string) => /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u.test(s);

/** Valeur la plus fréquente (null si aucune). */
function mostCommon(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  values.forEach((v) => v && counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

type Phase = { kind: 'review' } | { kind: 'working'; done: number; total: number; step: string } | { kind: 'done'; report: BatchImportReport };

/** Parcours B : vérifier plusieurs tomes, choisir la série, puis tout ajouter en une fois. */
export default function BatchImportScreen() {
  const db = useDb();
  const { colors } = useTheme();
  const items = useMemo(() => sortForImport(searchSession.selection()), []);
  const [existing, setExisting] = useState<ExistingVolumeKey[] | null>(null);
  const [seriesList, setSeriesList] = useState<{ id: string; title: string }[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [author, setAuthor] = useState(() => mostCommon(items.flatMap((c) => c.authors.filter(isLatin))) ?? items[0]?.authors[0] ?? '');
  const suggestedSeries = mostCommon(items.map((c) => c.seriesTitle)) ?? '';
  const [seriesMode, setSeriesMode] = useState<'new' | 'existing' | 'none'>('new');
  const [newSeriesTitle, setNewSeriesTitle] = useState(suggestedSeries);
  const [existingSeriesId, setExistingSeriesId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const [error, setError] = useState<string | null>(null);

  const inSelectionDup = useMemo(() => duplicatesWithinSelection(items), [items]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [keys, series] = await Promise.all([loadExistingKeys(db), listSeries(db)]);
      if (!alive) return;
      setExisting(keys);
      setSeriesList(series.map((s) => ({ id: s.id, title: s.title })));
      // Une série existante au même nom est proposée par défaut.
      const same = series.find((s) => normalizeForMatch(s.title) === normalizeForMatch(suggestedSeries));
      if (same) {
        setSeriesMode('existing');
        setExistingSeriesId(same.id);
      }
      setChecked(new Set(items.filter((c) => !findDuplicate(c, keys) && !inSelectionDup.has(c.id)).map((c) => c.id)));
    })().catch(() => log.warn('book_search.batch_load_failed'));
    return () => {
      alive = false;
    };
  }, [db, items, inSelectionDup, suggestedSeries]);

  if (!items.length) return <EmptyState title="Aucun tome sélectionné" text="Revenez à la recherche pour cocher des tomes." />;

  const chosen = items.filter((c) => checked.has(c.id));
  const languages = new Set(chosen.map((c) => c.language ?? '?'));
  const publishers = new Set(chosen.map((c) => normalizeForMatch(c.publisher) || '?'));
  const noNumber = chosen.filter((c) => !c.volume).length;

  const noteFor = (c: BookCandidate): string | null => {
    if (existing && findDuplicate(c, existing)) return 'Déjà dans la bibliothèque : non coché';
    if (inSelectionDup.has(c.id)) return 'En double dans la sélection : non coché';
    return null;
  };

  const submit = async () => {
    setError(null);
    if (!author.trim()) {
      setError('Indiquez l’auteur.');
      return;
    }
    let series: SeriesChoice = { kind: 'none' };
    if (seriesMode === 'new') {
      if (!newSeriesTitle.trim()) {
        setError('Indiquez le nom de la nouvelle série.');
        return;
      }
      series = { kind: 'new', title: newSeriesTitle.trim(), author: author.trim() };
    } else if (seriesMode === 'existing') {
      if (!existingSeriesId) {
        setError('Choisissez une série.');
        return;
      }
      series = { kind: 'existing', seriesId: existingSeriesId };
    }
    try {
      // 1. Édition exacte de chaque tome (pages, ISBN, couverture de la même édition).
      const http = appHttp();
      const enriched: BookCandidate[] = [];
      for (const [i, c] of chosen.entries()) {
        setPhase({ kind: 'working', done: i, total: chosen.length, step: 'Lecture des détails des éditions' });
        enriched.push(await enrichCandidate(c, http));
        if (c.source === 'openlibrary' || !c.coverUrl) await new Promise((r) => setTimeout(r, OL_SPACING_MS));
      }
      setPhase({ kind: 'working', done: chosen.length, total: chosen.length, step: 'Téléchargement des couvertures et ajout' });
      // 2. Ajout : doublons revérifiés, une seule transaction.
      const report = await importBatch(
        db,
        { items: enriched, series, author: author.trim(), newId: randomUUID, nowIso: new Date().toISOString() },
        { download: downloadCover, persist: persistCover, discard: discardCover },
      );
      log.info('book_search.added', { count: report.added.length, duplicates: report.skippedDuplicates.length, coverFailures: report.coverFailures });
      setPhase({ kind: 'done', report });
    } catch {
      log.error('book_search.batch_failed');
      setError('L’ajout a échoué. Rien n’a été enregistré. Réessayez.');
      setPhase({ kind: 'review' });
    }
  };

  if (phase.kind === 'done') {
    const r = phase.report;
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {r.added.length} tome{r.added.length > 1 ? 's' : ''} ajouté{r.added.length > 1 ? 's' : ''}
        </Text>
        {r.added.map((a) => (
          <Text key={a.id} style={{ color: colors.textSecondary }}>
            ✓ {a.volumeLabel ? `Tome ${a.volumeLabel} — ` : ''}
            {a.title}
          </Text>
        ))}
        {r.skippedDuplicates.length ? (
          <Text style={{ color: colors.warning }}>
            {r.skippedDuplicates.length} doublon{r.skippedDuplicates.length > 1 ? 's' : ''} non ajouté{r.skippedDuplicates.length > 1 ? 's' : ''} :{' '}
            {r.skippedDuplicates.map((d) => (d.volumeLabel ? `tome ${d.volumeLabel}` : d.title)).join(', ')}
          </Text>
        ) : null}
        {r.skippedInvalid.length ? (
          <Text style={{ color: colors.warning }}>
            {r.skippedInvalid.length} fiche{r.skippedInvalid.length > 1 ? 's' : ''} incomplète{r.skippedInvalid.length > 1 ? 's' : ''} non ajoutée
            {r.skippedInvalid.length > 1 ? 's' : ''} (à ajouter à la main).
          </Text>
        ) : null}
        {r.coverFailures ? (
          <Text style={{ color: colors.warning }}>
            {r.coverFailures} couverture{r.coverFailures > 1 ? 's' : ''} non téléchargée{r.coverFailures > 1 ? 's' : ''} : modifiables plus tard depuis la fiche du livre.
          </Text>
        ) : null}
        {r.seriesId ? (
          <Button
            label="Voir la série"
            big
            onPress={() => {
              router.dismissAll();
              router.push(`/series/${r.seriesId}`);
            }}
          />
        ) : null}
        <Button label="Retour à la bibliothèque" variant="secondary" onPress={() => router.dismissAll()} />
      </ScrollView>
    );
  }

  const working = phase.kind === 'working';
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={{ color: colors.textSecondary }}>
        Vérifiez les tomes : seuls les tomes cochés seront ajoutés, dans l’ordre des numéros. La numérotation est celle de chaque édition ;
        les numérotations japonaise, anglaise et française peuvent différer.
      </Text>
      {languages.size > 1 ? (
        <Text style={{ color: colors.warning }}>⚠ Langues mélangées : {[...languages].map((l) => languageLabel(l === '?' ? null : l)).join(', ')}.</Text>
      ) : null}
      {publishers.size > 1 ? <Text style={{ color: colors.warning }}>⚠ Plusieurs éditeurs : les numéros de tome peuvent ne pas correspondre.</Text> : null}
      {noNumber ? (
        <Text style={{ color: colors.warning }}>
          ⚠ {noNumber} tome{noNumber > 1 ? 's' : ''} sans numéro (classé{noNumber > 1 ? 's' : ''} à la fin, modifiable ensuite).
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {items.map((c) => (
          <CandidateRow
            key={c.id}
            c={c}
            selectable
            selected={checked.has(c.id)}
            note={noteFor(c)}
            onPress={() =>
              setChecked((s) => {
                const n = new Set(s);
                if (n.has(c.id)) n.delete(c.id);
                else n.add(c.id);
                return n;
              })
            }
          />
        ))}
      </View>

      <Field label="Auteur (appliqué à tous les tomes)" required value={author} onChangeText={setAuthor} />

      <SectionTitle>Série</SectionTitle>
      <View style={styles.chips}>
        <Chip label="Nouvelle série" selected={seriesMode === 'new'} onPress={() => setSeriesMode('new')} />
        {seriesList.length ? <Chip label="Série existante" selected={seriesMode === 'existing'} onPress={() => setSeriesMode('existing')} /> : null}
        <Chip label="Sans série" selected={seriesMode === 'none'} onPress={() => setSeriesMode('none')} />
      </View>
      {seriesMode === 'new' ? <Field label="Nom de la série" required value={newSeriesTitle} onChangeText={setNewSeriesTitle} /> : null}
      {seriesMode === 'existing' ? (
        <View style={styles.chips}>
          {seriesList.map((s) => (
            <Chip key={s.id} label={s.title} selected={existingSeriesId === s.id} onPress={() => setExistingSeriesId(s.id)} />
          ))}
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {working ? (
        <Text style={{ color: colors.textSecondary }}>
          {phase.step}… {phase.done}/{phase.total}
        </Text>
      ) : null}
      <Button
        label={`Ajouter ${chosen.length} tome${chosen.length > 1 ? 's' : ''}`}
        big
        busy={working}
        disabled={!chosen.length || !existing}
        onPress={() => void submit()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { fontSize: 22, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
