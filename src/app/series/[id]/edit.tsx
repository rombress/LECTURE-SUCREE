import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { EmptyState } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { getSeries, updateSeries } from '@/data/repositories/series';
import { discardCover, resolveCoverDraft } from '@/features/covers/coverStore';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { SeriesForm } from '@/features/library/SeriesForm';

export default function EditSeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const load = useCallback(() => getSeries(db, id), [db, id]);
  const { data: series, failed } = useFocusLoad(load);

  if (failed) return <EmptyState title="Erreur" text="Impossible de charger cette série." />;
  if (!series) return null;
  return (
    <SeriesForm
      initial={series}
      submitLabel="Enregistrer"
      onSubmit={async (input, cover) => {
        const { coverPath, discard } = await resolveCoverDraft(cover, series.id, series.coverPath);
        await updateSeries(
          db,
          series.id,
          { ...input, coverPath: coverPath === undefined ? series.coverPath : coverPath },
          new Date().toISOString(),
        );
        discardCover(discard);
        router.back();
      }}
    />
  );
}
