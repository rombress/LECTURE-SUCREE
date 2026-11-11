import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';

import { useDb } from '@/data/db/DatabaseProvider';
import { createSeries } from '@/data/repositories/series';
import { resolveCoverDraft } from '@/features/covers/coverStore';
import { SeriesForm } from '@/features/library/SeriesForm';

export default function NewSeriesScreen() {
  const db = useDb();
  return (
    <SeriesForm
      submitLabel="Créer la série"
      onSubmit={async (input, cover) => {
        const id = randomUUID();
        const { coverPath } = await resolveCoverDraft(cover, id, null);
        const s = await createSeries(db, id, { ...input, coverPath: coverPath ?? null }, new Date().toISOString());
        router.replace(`/series/${s.id}`);
      }}
    />
  );
}
