import { randomUUID } from 'expo-crypto';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, EmptyState, Field, SectionTitle } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { listSeries } from '@/data/repositories/series';
import { parseVolumeNumber } from '@/domain/validation';
import { CandidateRow } from '@/features/bookSearch/CandidateRow';
import { duplicatesWithinSelection, findDuplicate, loadExistingKeys, type ExistingVolumeKey } from '@/features/bookSearch/duplicates';
import { importBatch, sortForImport, type BatchImportReport, type SeriesChoice } from '@/features/bookSearch/importBooks';
import { enrichCandidate, OL_SPACING_MS } from '@/features/bookSearch/search';
import { appHttp, searchSession } from '@/features/bookSearch/session';
import { normalizeForMatch } from '@/features/bookSearch/text';
import { languageLabel, type BookCandidate } from '@/features/bookSearch/types';
import { discardCover, discardPendingCover, downloadCover, persistCover } from '@/features/covers/coverStore';
import { parseOptionalInt } from '@/features/library/VolumeForm';
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

/** Corrections de l'utilisateur, tome par tome (texte saisi). */
type Override = { title: string; label: string; pages: string };

/** Applique les corrections : ce qui sera enregistré est exactement ce qui est affiché. */
function applyOverride(c: BookCandidate, o: Override | undefined): BookCandidate {
  if (!o) return c;
  const label = o.label.trim();
  const number = parseVolumeNumber(label);
  const pages = parseOptionalInt(o.pages);
  const sameLabel = c.volume && c.volume.label === label;
  return {
    ...c,
    title: o.title,
    pageCount: pages,
    volume: !label
      ? null
      : sameLabel && c.volume
        ? c.volume
        : { label, number, kind: number != null && !Number.isInteger(number) ? 'decimal' : 'regular', origin: 'catalog', confident: true },
  };
}

type Phase =
  | { kind: 'preparing'; done: number; total: number }
  | { kind: 'review' }
  | { kind: 'working' }
  | { kind: 'done'; report: BatchImportReport }
  | { kind: 'cancelled' };

/**
 * Parcours B : 1) relecture des éditions exactes ; 2) vérification et
 * correction de chaque tome, choix de la série ; 3) ajout en une fois.
 */
export default function BatchImportScreen() {
  const db = useDb();
  const { colors } = useTheme();
  const selection = useMemo(() => sortForImport(searchSession.selection()), []);
  const [enriched, setEnriched] = useState<BookCandidate[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingVolumeKey[] | null>(null);
  const [seriesList, setSeriesList] = useState<{ id: string; title: string }[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [author, setAuthor] = useState(() => mostCommon(selection.flatMap((c) => c.authors.filter(isLatin))) ?? selection[0]?.authors[0] ?? '');
  const [seriesMode, setSeriesMode] = useState<'new' | 'existing' | 'none'>('new');
  const [newSeriesTitle, setNewSeriesTitle] = useState('');
  const [existingSeriesId, setExistingSeriesId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'preparing', done: 0, total: selection.length });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(new AbortController());

  // 1. Édition exacte de chaque tome, AVANT la vérification (pages, ISBN et
  //    couverture affichés = ceux qui seront enregistrés). Annulé si l'écran est quitté.
  useEffect(() => {
    const ctrl = abortRef.current;
    void (async () => {
      const http = appHttp();
      const out: BookCandidate[] = [];
      for (const [i, c] of selection.entries()) {
        setPhase({ kind: 'preparing', done: i, total: selection.length });
        out.push(await enrichCandidate(c, http, ctrl.signal).catch(() => c));
        if (ctrl.signal.aborted) return;
        if (i < selection.length - 1) await new Promise((r) => setTimeout(r, OL_SPACING_MS));
      }
      const [keys, series] = await Promise.all([loadExistingKeys(db), listSeries(db)]);
      if (ctrl.signal.aborted) return;
      const sorted = sortForImport(out);
      const dupInSelection = duplicatesWithinSelection(sorted);
      const suggested = mostCommon(sorted.map((c) => c.seriesTitle)) ?? '';
      const same = series.find((s) => normalizeForMatch(s.title) === normalizeForMatch(suggested));
      setEnriched(sorted);
      setExisting(keys);
      setSeriesList(series.map((s) => ({ id: s.id, title: s.title })));
      setNewSeriesTitle(suggested);
      if (same) {
        setSeriesMode('existing');
        setExistingSeriesId(same.id);
      }
      setChecked(new Set(sorted.filter((c) => !findDuplicate(c, keys) && !dupInSelection.has(c.id)).map((c) => c.id)));
      setPhase({ kind: 'review' });
    })().catch(() => {
      if (!ctrl.signal.aborted) setPhase({ kind: 'cancelled' });
      log.warn('book_search.batch_prepare_failed');
    });
    return () => ctrl.abort();
  }, [db, selection]);

  const items = useMemo(() => enriched.map((c) => applyOverride(c, overrides[c.id])), [enriched, overrides]);
  const inSelectionDup = useMemo(() => duplicatesWithinSelection(items), [items]);

  if (!selection.length) return <EmptyState title="Aucun tome sélectionné" text="Revenez à la recherche pour cocher des tomes." />;
  if (phase.kind === 'cancelled') return <EmptyState title="Préparation impossible" text="Revenez en arrière et réessayez." />;
  if (phase.kind === 'preparing') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
          Lecture des éditions exactes… {phase.done}/{phase.total}
          {'\n'}Vous pourrez tout vérifier et corriger avant l’ajout.
        </Text>
      </View>
    );
  }

  const chosen = items.filter((c) => checked.has(c.id));
  const languages = new Set(chosen.map((c) => c.language ?? '?'));
  const publishers = new Set(chosen.map((c) => normalizeForMatch(c.publisher) || '?'));
  const noNumber = chosen.filter((c) => !c.volume).length;

  const noteFor = (c: BookCandidate): string | null => {
    const notes: string[] = [];
    if (existing && findDuplicate(c, existing)) notes.push('Déjà dans la bibliothèque');
    else if (inSelectionDup.has(c.id)) notes.push('En double dans la sélection');
    if (c.warnings.length) notes.push(c.warnings.join(' · '));
    return notes.length ? notes.join(' — ') : null;
  };

  const startEdit = (c: BookCandidate) => {
    setEditing(editing === c.id ? null : c.id);
    setOverrides((o) =>
      o[c.id] ? o : { ...o, [c.id]: { title: c.title, label: c.volume?.label ?? '', pages: c.pageCount ? String(c.pageCount) : '' } },
    );
  };

  const submit = async () => {
    setError(null);
    if (!author.trim()) return setError('Indiquez l’auteur.');
    const invalid = chosen.find((c) => !c.title.trim() || (overrides[c.id]?.pages.trim() && c.pageCount == null) || Number.isNaN(c.pageCount));
    if (invalid) {
      setEditing(invalid.id);
      return setError('Un tome coché a un titre vide ou un nombre de pages invalide.');
    }
    let series: SeriesChoice = { kind: 'none' };
    if (seriesMode === 'new') {
      if (!newSeriesTitle.trim()) return setError('Indiquez le nom de la nouvelle série.');
      series = { kind: 'new', title: newSeriesTitle.trim(), author: author.trim() };
    } else if (seriesMode === 'existing') {
      if (!existingSeriesId) return setError('Choisissez une série.');
      series = { kind: 'existing', seriesId: existingSeriesId };
    }
    setPhase({ kind: 'working' });
    try {
      // Doublons revérifiés et écriture en une seule transaction.
      const report = await importBatch(
        db,
        { items: chosen, series, author: author.trim(), newId: randomUUID, nowIso: new Date().toISOString() },
        { download: downloadCover, persist: persistCover, discard: discardCover, discardPending: discardPendingCover },
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
            {r.coverFailures} couverture{r.coverFailures > 1 ? 's' : ''} non téléchargée{r.coverFailures > 1 ? 's' : ''} : livre{r.coverFailures > 1 ? 's' : ''}{' '}
            ajouté{r.coverFailures > 1 ? 's' : ''} sans image, modifiable plus tard depuis la fiche.
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
      {/* Pendant l'écriture, pas de retour par geste ni par bouton : l'opération va au bout. */}
      <Stack.Screen options={{ gestureEnabled: !working, headerBackVisible: !working }} />
      <Text style={{ color: colors.textSecondary }}>
        Vérifiez chaque tome : seuls les tomes cochés seront ajoutés, dans l’ordre des numéros, avec les informations affichées. « Corriger » permet
        de modifier le titre, le numéro et les pages. La numérotation est celle de chaque édition ; les numérotations japonaise, anglaise et française
        peuvent différer.
      </Text>
      {languages.size > 1 ? (
        <Text style={{ color: colors.warning }}>⚠ Langues mélangées : {[...languages].map((l) => languageLabel(l === '?' ? null : l)).join(', ')}.</Text>
      ) : null}
      {publishers.size > 1 ? <Text style={{ color: colors.warning }}>⚠ Plusieurs éditeurs : les numéros de tome peuvent ne pas correspondre.</Text> : null}
      {noNumber ? (
        <Text style={{ color: colors.warning }}>
          ⚠ {noNumber} tome{noNumber > 1 ? 's' : ''} sans numéro (classé{noNumber > 1 ? 's' : ''} à la fin).
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {items.map((c) => (
          <View key={c.id} style={{ gap: 6 }}>
            <CandidateRow
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
            <Pressable accessibilityRole="button" onPress={() => startEdit(c)} disabled={working} style={styles.editLink}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{editing === c.id ? 'Fermer' : 'Corriger ce tome'}</Text>
            </Pressable>
            {editing === c.id && overrides[c.id] ? (
              <View style={[styles.editor, { borderColor: colors.border }]}>
                <Field label="Titre" value={overrides[c.id]!.title} onChangeText={(t) => setOverrides((o) => ({ ...o, [c.id]: { ...o[c.id]!, title: t } }))} />
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Field label="Tome" value={overrides[c.id]!.label} onChangeText={(t) => setOverrides((o) => ({ ...o, [c.id]: { ...o[c.id]!, label: t } }))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Pages"
                      value={overrides[c.id]!.pages}
                      keyboardType="number-pad"
                      onChangeText={(t) => setOverrides((o) => ({ ...o, [c.id]: { ...o[c.id]!, pages: t } }))}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </View>
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
      {working ? <Text style={{ color: colors.textSecondary }}>Téléchargement des couvertures et ajout…</Text> : null}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { fontSize: 22, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  editLink: { alignSelf: 'flex-end', paddingHorizontal: spacing.sm, paddingVertical: 2 },
  editor: { gap: spacing.sm, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
});
