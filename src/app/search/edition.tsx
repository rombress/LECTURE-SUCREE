import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { createVolume } from '@/data/repositories/volumes';
import { findDuplicate, loadExistingKeys } from '@/features/bookSearch/duplicates';
import { enrichCandidate } from '@/features/bookSearch/search';
import { appHttp, searchSession } from '@/features/bookSearch/session';
import { coverCredit, FORMAT_LABELS, languageLabel, SOURCE_FULL_NAMES, SOURCE_LABELS, type BookCandidate } from '@/features/bookSearch/types';
import { discardCover, discardPendingCover, downloadCover, resolveCoverDraft, type CoverDraft } from '@/features/covers/coverStore';
import { VolumeForm } from '@/features/library/VolumeForm';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Loaded = { c: BookCandidate; cover: CoverDraft; coverNote: string | null; duplicate: boolean; downloadedUri: string | null };

/** Parcours A : vérifier l'édition trouvée, la corriger si besoin, puis l'ajouter. */
export default function EditionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { colors } = useTheme();
  const [state, setState] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  // Le résultat vient de la recherche en mémoire ; absent si l'app a été relancée.
  // Figé au premier rendu : la mise à jour en mémoire ne relance pas le chargement.
  const [start] = useState(() => searchSession.get(id));
  // Image téléchargée dans le cache : supprimée en quittant l'écran sans ajout.
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    if (!start) return;
    (async () => {
      // 1. Édition exacte (pages, ISBN et couverture de la MÊME édition).
      const c = await enrichCandidate(start, appHttp(), ctrl.signal).catch(() => start);
      searchSession.update(c);
      // 2. Couverture téléchargée dans le cache (rien d'enregistré avant « Ajouter »).
      let cover: CoverDraft = { kind: 'keep' };
      let coverNote: string | null = null;
      let downloadedUri: string | null = null;
      if (ctrl.signal.aborted) return;
      if (c.coverUrl) {
        try {
          downloadedUri = await downloadCover(c.coverUrl);
          pendingRef.current = downloadedUri;
          if (ctrl.signal.aborted) return;
          cover = { kind: 'new', pendingUri: downloadedUri };
        } catch {
          coverNote = 'La couverture n’a pas pu être téléchargée. Vous pouvez en choisir une dans Photos.';
          log.warn('book_search.cover_download_failed');
        }
      } else {
        coverNote = 'Aucune couverture trouvée pour cette édition. Vous pouvez en choisir une dans Photos.';
      }
      const duplicate = !!findDuplicate(c, await loadExistingKeys(db));
      if (!ctrl.signal.aborted) setState({ c, cover, coverNote, duplicate, downloadedUri });
    })().catch(() => {
      if (!ctrl.signal.aborted) setFailed(true);
    });
    return () => {
      ctrl.abort();
      discardPendingCover(pendingRef.current);
    };
  }, [db, start]);

  if (!start) return <EmptyState title="Résultat expiré" text="Relancez la recherche." />;
  if (failed) return <EmptyState title="Édition non préparée" text="Une erreur s’est produite en lisant cette édition. Revenez en arrière et réessayez." />;
  if (!state) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary }}>Lecture des détails de cette édition…</Text>
      </View>
    );
  }
  const { c } = state;

  const info = (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Édition trouvée</Text>
      <Text style={{ color: colors.textSecondary }}>
        {languageLabel(c.language)} · {c.publisher ?? 'éditeur inconnu'}
        {c.publishedYear ? ` · ${c.publishedYear}` : ''} · {FORMAT_LABELS[c.format]}
      </Text>
      <Text style={{ color: colors.textSecondary }}>
        {c.volume ? `Tome ${c.volume.label} (${c.volume.origin === 'catalog' ? 'indiqué par le catalogue' : 'déduit du titre'})` : 'Numéro de tome non indiqué'}
        {c.seriesTitle ? ` · série « ${c.seriesTitle} »` : ''}
      </Text>
      {c.altTitles.length ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>Autres titres : {c.altTitles.join(' · ')}</Text> : null}
      {c.physical ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>Description matérielle : {c.physical}</Text> : null}
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>Source : {c.sources.map((s) => SOURCE_LABELS[s]).join(' + ')}</Text>
      {state.downloadedUri && c.coverSource ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Couverture de cette édition : {SOURCE_FULL_NAMES[c.coverSource]}</Text>
      ) : null}
      {c.formatReasons.length ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Format : {c.formatReasons.join(', ')}</Text> : null}
      {[...c.warnings, ...(state.coverNote ? [state.coverNote] : [])].map((w) => (
        <Text key={w} style={{ color: colors.warning, fontSize: 13 }}>
          ⚠ {w}
        </Text>
      ))}
      {state.duplicate ? (
        <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Ce livre semble déjà être dans votre bibliothèque.</Text>
      ) : null}
    </View>
  );

  return (
    <VolumeForm
      header={info}
      prefill={{
        title: c.title,
        author: c.authors[0] ?? '',
        volumeLabel: c.volume?.label ?? null,
        pageCount: c.pageCount,
        description: c.description,
        isbn: c.isbn,
        publisher: c.publisher,
        language: c.language,
        sourceRef: c.sourceRef,
      }}
      initialCover={state.cover}
      submitLabel="Ajouter"
      onSubmit={async (input, cover) => {
        const newId = randomUUID();
        const { coverPath } = await resolveCoverDraft(cover, newId, null);
        // Mention de provenance seulement si l'image est bien celle téléchargée
        // (pas une image choisie ensuite dans Photos).
        const imported = cover.kind === 'new' && cover.pendingUri === state.downloadedUri && c.coverSource;
        const credit = coverPath && imported && c.coverSource ? coverCredit(c.coverSource, new Date()) : null;
        try {
          await createVolume(db, newId, { ...input, coverPath: coverPath ?? null, coverCredit: credit }, new Date().toISOString());
        } catch (e) {
          // Rien en base : la copie de la couverture ne doit pas rester orpheline.
          discardCover(coverPath);
          throw e;
        }
        // Copiée dans le stockage privé : l'image du cache n'est plus utile.
        discardPendingCover(state.downloadedUri);
        pendingRef.current = null;
        log.info('book_search.added', { count: 1 });
        router.dismissAll();
        router.push(`/volume/${newId}`);
      }}
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  card: { gap: 4, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
