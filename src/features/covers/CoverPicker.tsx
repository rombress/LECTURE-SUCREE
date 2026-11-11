import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CoverArt } from '@/components/CoverArt';
import { Button } from '@/components/ui';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { pickCoverFromFiles, pickCoverFromPhotos, type CoverDraft } from './coverStore';

/** Choix de couverture dans un formulaire (Photos, Fichiers, retrait). */
export function CoverPicker({
  title,
  author,
  currentPath,
  draft,
  onChange,
}: {
  title: string;
  author?: string | null;
  currentPath: string | null;
  draft: CoverDraft;
  onChange: (d: CoverDraft) => void;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = async (from: 'photos' | 'files') => {
    setBusy(true);
    setFailed(false);
    try {
      const uri = from === 'photos' ? await pickCoverFromPhotos() : await pickCoverFromFiles();
      if (uri) onChange({ kind: 'new', pendingUri: uri });
    } catch (e) {
      log.error('cover.pick_failed', { kind: e instanceof Error ? e.name : 'unknown', from });
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const shownPath = draft.kind === 'keep' ? currentPath : null;
  const pendingUri = draft.kind === 'new' ? draft.pendingUri : null;
  const hasImage = !!pendingUri || !!shownPath;

  return (
    <View style={styles.row}>
      <CoverArt title={title.trim() || 'Titre'} author={author} width={96} coverPath={shownPath} pendingUri={pendingUri} />
      <View style={styles.actions}>
        <Button label="Photos" variant="secondary" onPress={() => void pick('photos')} busy={busy} />
        <Button label="Fichiers" variant="secondary" onPress={() => void pick('files')} disabled={busy} />
        {hasImage ? <Button label="Sans image" variant="secondary" onPress={() => onChange({ kind: 'remove' })} disabled={busy} /> : null}
        {failed ? <Text style={{ color: colors.danger, fontSize: 13 }}>Image illisible ou import impossible.</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  actions: { flex: 1, gap: spacing.sm },
});
