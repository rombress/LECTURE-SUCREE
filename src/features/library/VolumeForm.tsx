import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Field, SectionTitle } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { listSeries } from '@/data/repositories/series';
import { ValidationError, type VolumeFormInput } from '@/data/repositories/volumes';
import { VOLUME_STATUSES, VOLUME_STATUS_LABELS, type Volume, type VolumeStatus } from '@/domain/models';
import { normalizeIsbn } from '@/domain/isbn';
import { validateVolume } from '@/domain/validation';
import { languageLabel } from '@/features/bookSearch/types';
import { CoverPicker } from '@/features/covers/CoverPicker';
import type { CoverDraft } from '@/features/covers/coverStore';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Convertit une saisie en entier positif, ou null si vide. NaN si invalide (refusé par la validation). */
export function parseOptionalInt(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

/** Valeurs proposées par une recherche de livre (toutes modifiables avant l'ajout). */
export interface VolumeFormPrefill {
  title?: string;
  author?: string;
  volumeLabel?: string | null;
  pageCount?: number | null;
  description?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  language?: string | null;
  sourceRef?: string | null;
}

const LANGUAGE_CHOICES: { code: string | null; label: string }[] = [
  { code: 'fre', label: 'Français' },
  { code: 'eng', label: 'Anglais' },
  { code: 'jpn', label: 'Japonais' },
  { code: null, label: 'Non précisée' },
];

export function VolumeForm({
  initial,
  prefill,
  initialCover,
  defaultSeriesId,
  submitLabel,
  onSubmit,
  header,
}: {
  initial?: Volume;
  prefill?: VolumeFormPrefill;
  initialCover?: CoverDraft;
  defaultSeriesId?: string | null;
  submitLabel: string;
  onSubmit: (input: VolumeFormInput, cover: CoverDraft) => Promise<void>;
  /** Contenu affiché au-dessus du formulaire (ex. fiche de l'édition trouvée). */
  header?: ReactNode;
}) {
  const db = useDb();
  const { colors } = useTheme();
  const base = initial ?? prefill;
  const [title, setTitle] = useState(base?.title ?? '');
  const [author, setAuthor] = useState(base?.author ?? '');
  const [volumeLabel, setVolumeLabel] = useState(base?.volumeLabel ?? '');
  const [pageCount, setPageCount] = useState(base?.pageCount != null ? String(base.pageCount) : '');
  const [currentPage, setCurrentPage] = useState(initial ? String(initial.currentPage) : '');
  const [status, setStatus] = useState<VolumeStatus>(initial?.status ?? 'to_read');
  const [description, setDescription] = useState(base?.description ?? '');
  const [isbn, setIsbn] = useState(base?.isbn ?? '');
  const [publisher, setPublisher] = useState(base?.publisher ?? '');
  const [language, setLanguage] = useState<string | null>(base?.language ?? null);
  const [seriesId, setSeriesId] = useState<string | null>(initial ? initial.seriesId : (defaultSeriesId ?? null));
  const [seriesOptions, setSeriesOptions] = useState<{ id: string; title: string }[]>([]);
  const [cover, setCover] = useState<CoverDraft>(initialCover ?? { kind: 'keep' });
  const languageChoices = LANGUAGE_CHOICES.some((l) => l.code === language)
    ? LANGUAGE_CHOICES
    : [...LANGUAGE_CHOICES.slice(0, 3), { code: language, label: languageLabel(language) }, LANGUAGE_CHOICES[3]!];
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    listSeries(db)
      .then((list) => {
        if (alive) setSeriesOptions(list.map((s) => ({ id: s.id, title: s.title })).sort((a, b) => a.title.localeCompare(b.title, 'fr')));
      })
      .catch(() => log.warn('volume_form.series_load_failed'));
    return () => {
      alive = false;
    };
  }, [db]);

  const movedOut = !!initial && initial.seriesId !== seriesId;

  const submit = async () => {
    const input: VolumeFormInput = {
      title,
      author,
      volumeLabel,
      pageCount: parseOptionalInt(pageCount),
      currentPage: parseOptionalInt(currentPage) ?? 0,
      status,
      description,
      seriesId,
      isbn,
      publisher,
      language,
      ...(prefill?.sourceRef !== undefined && !initial ? { sourceRef: prefill.sourceRef } : {}),
    };
    const v = validateVolume(input);
    const isbnError = isbn.trim() && !normalizeIsbn(isbn) ? { isbn: 'ISBN invalide (10 ou 13 chiffres, clé de contrôle).' } : null;
    if (!v.ok || isbnError) {
      setErrors({ ...(v.ok ? {} : v.errors), ...(isbnError ?? {}) });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit(input, cover);
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.errors);
      else {
        log.error('volume.save_failed', { kind: e instanceof Error ? e.name : 'unknown' });
        setErrors({ form: 'L’enregistrement a échoué. Réessayez.' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        <CoverPicker title={title} author={author} currentPath={initial?.coverPath ?? null} draft={cover} onChange={setCover} />
        <Field label="Titre" required value={title} onChangeText={setTitle} error={errors.title} autoFocus={!initial} returnKeyType="next" />
        <Field label="Auteur" required value={author} onChangeText={setAuthor} error={errors.author} returnKeyType="next" />

        <SectionTitle>Série</SectionTitle>
        <View style={styles.chips}>
          <Chip label="Livre indépendant" selected={seriesId === null} onPress={() => setSeriesId(null)} />
          {seriesOptions.map((s) => (
            <Chip key={s.id} label={s.title} selected={seriesId === s.id} onPress={() => setSeriesId(s.id)} />
          ))}
        </View>
        {movedOut ? (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            Le tome changera de série. Ses sessions et enregistrements restent attachés à ce tome.
          </Text>
        ) : null}
        <Field
          label="Tome (numéro ou libellé)"
          value={volumeLabel}
          onChangeText={setVolumeLabel}
          placeholder="ex. 3, Tome 3, Hors-série"
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Pages au total" value={pageCount} onChangeText={setPageCount} keyboardType="number-pad" error={errors.pageCount} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Page actuelle" value={currentPage} onChangeText={setCurrentPage} keyboardType="number-pad" error={errors.currentPage} />
          </View>
        </View>
        <SectionTitle>Statut</SectionTitle>
        <View style={styles.chips}>
          {VOLUME_STATUSES.map((s) => (
            <Chip key={s} label={VOLUME_STATUS_LABELS[s]} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </View>
        <Field label="Description" value={description} onChangeText={setDescription} multiline />

        <SectionTitle>Édition (facultatif)</SectionTitle>
        <Field label="Éditeur" value={publisher} onChangeText={setPublisher} />
        <Field label="ISBN" value={isbn} onChangeText={setIsbn} keyboardType="number-pad" error={errors.isbn} placeholder="13 chiffres" />
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Langue</Text>
        <View style={styles.chips}>
          {languageChoices.map((l) => (
            <Chip key={l.code ?? 'none'} label={l.label} selected={language === l.code} onPress={() => setLanguage(l.code)} />
          ))}
        </View>
        {errors.form ? <Text style={{ color: colors.danger }}>{errors.form}</Text> : null}
        <Button label={submitLabel} onPress={() => void submit()} busy={saving} big />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
