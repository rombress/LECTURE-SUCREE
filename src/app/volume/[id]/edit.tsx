import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { EmptyState } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { getVolume, updateVolume } from '@/data/repositories/volumes';
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
      onSubmit={async (input) => {
        await updateVolume(db, volume.id, input, new Date().toISOString());
        router.back();
      }}
    />
  );
}
