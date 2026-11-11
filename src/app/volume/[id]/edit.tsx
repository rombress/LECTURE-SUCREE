import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { EmptyState } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { getVolume, updateVolume } from '@/data/repositories/volumes';
import { discardCover, resolveCoverDraft } from '@/features/covers/coverStore';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { VolumeForm } from '@/features/library/VolumeForm';

export default function EditVolumeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const load = useCallback(() => getVolume(db, id), [db, id]);
  const { data: volume, failed } = useFocusLoad(load);

  if (failed) return <EmptyState title="Erreur" text="Impossible de charger ce livre." />;
  if (!volume) return null;
  return (
    <VolumeForm
      initial={volume}
      submitLabel="Enregistrer"
      onSubmit={async (input, cover) => {
        const { coverPath, discard } = await resolveCoverDraft(cover, volume.id, volume.coverPath);
        await updateVolume(db, volume.id, { ...input, coverPath }, new Date().toISOString());
        // L'ancienne copie n'est supprimée qu'APRÈS l'enregistrement réussi.
        discardCover(discard);
        router.back();
      }}
    />
  );
}
