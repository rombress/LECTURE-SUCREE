import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';

import { useDb } from '@/data/db/DatabaseProvider';
import { createVolume } from '@/data/repositories/volumes';
import { resolveCoverDraft } from '@/features/covers/coverStore';
import { VolumeForm } from '@/features/library/VolumeForm';

export default function NewVolumeScreen() {
  const db = useDb();
  const { seriesId } = useLocalSearchParams<{ seriesId?: string }>();
  return (
    <VolumeForm
      defaultSeriesId={seriesId ?? null}
      submitLabel="Ajouter à ma bibliothèque"
      onSubmit={async (input, cover) => {
        const id = randomUUID();
        const { coverPath } = await resolveCoverDraft(cover, id, null);
        const v = await createVolume(db, id, { ...input, coverPath: coverPath ?? null }, new Date().toISOString());
        router.replace(`/volume/${v.id}`);
      }}
    />
  );
}
