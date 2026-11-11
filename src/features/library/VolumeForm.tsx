import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Field, SectionTitle } from '@/components/ui';
import { ValidationError, type VolumeFormInput } from '@/data/repositories/volumes';
import { VOLUME_STATUSES, VOLUME_STATUS_LABELS, type Volume, type VolumeStatus } from '@/domain/models';
import { validateVolume } from '@/domain/validation';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Convertit une saisie en entier positif, ou null si vide. NaN si invalide (refusé par la validation). */
export function parseOptionalInt(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

export function VolumeForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Volume;
  submitLabel: string;
  onSubmit: (input: VolumeFormInput) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [volumeLabel, setVolumeLabel] = useState(initial?.volumeLabel ?? '');
  const [pageCount, setPageCount] = useState(initial?.pageCount != null ? String(initial.pageCount) : '');
  const [currentPage, setCurrentPage] = useState(initial ? String(initial.currentPage) : '');
  const [status, setStatus] = useState<VolumeStatus>(initial?.status ?? 'to_read');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const input: VolumeFormInput = {
      title,
      author,
      volumeLabel,
      pageCount: parseOptionalInt(pageCount),
      currentPage: parseOptionalInt(currentPage) ?? 0,
      status,
      description,
    };
    const v = validateVolume(input);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit(input);
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
        <Field label="Titre" required value={title} onChangeText={setTitle} error={errors.title} autoFocus={!initial} returnKeyType="next" />
        <Field label="Auteur" required value={author} onChangeText={setAuthor} error={errors.author} returnKeyType="next" />
        <Field label="Tome (numéro ou libellé)" value={volumeLabel} onChangeText={setVolumeLabel} placeholder="ex. 3, Tome 3, Hors-série" />
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
