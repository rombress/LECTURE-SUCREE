import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Field } from '@/components/ui';
import type { SeriesFormInput } from '@/data/repositories/series';
import { ValidationError } from '@/data/repositories/volumes';
import type { Series } from '@/domain/models';
import { validateSeries } from '@/domain/validation';
import { CoverPicker } from '@/features/covers/CoverPicker';
import type { CoverDraft } from '@/features/covers/coverStore';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export function SeriesForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Series;
  submitLabel: string;
  onSubmit: (input: SeriesFormInput, cover: CoverDraft) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [cover, setCover] = useState<CoverDraft>({ kind: 'keep' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const input: SeriesFormInput = { title, author, description };
    const v = validateSeries(input);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit(input, cover);
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.errors);
      else {
        log.error('series.save_failed', { kind: e instanceof Error ? e.name : 'unknown' });
        setErrors({ form: 'L’enregistrement a échoué. Réessayez.' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <CoverPicker title={title} author={author} currentPath={initial?.coverPath ?? null} draft={cover} onChange={setCover} />
        <Field label="Titre de la série" required value={title} onChangeText={setTitle} error={errors.title} autoFocus={!initial} />
        <Field label="Auteur" value={author} onChangeText={setAuthor} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          Sans couverture de série, celle du premier tome illustré est utilisée.
        </Text>
        {errors.form ? <Text style={{ color: colors.danger }}>{errors.form}</Text> : null}
        <Button label={submitLabel} onPress={() => void submit()} busy={saving} big />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
});
