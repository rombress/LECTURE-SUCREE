import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';

import { useDb } from '@/data/db/DatabaseProvider';
import { createVolume } from '@/data/repositories/volumes';
import { VolumeForm } from '@/features/library/VolumeForm';

export default function NewVolumeScreen() {
  const db = useDb();
  return (
    <VolumeForm
      submitLabel="Ajouter à ma bibliothèque"
      onSubmit={async (input) => {
        const v = await createVolume(db, randomUUID(), input, new Date().toISOString());
        router.replace(`/volume/${v.id}`);
      }}
    />
  );
}
