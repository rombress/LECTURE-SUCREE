import type { DbLike } from '../db/types';

import { listSeries, type SeriesWithStats } from './series';
import { listVolumes, type VolumeWithStats } from './volumes';

export type LibraryItem =
  | { kind: 'series'; key: string; activityAt: string; series: SeriesWithStats }
  | { kind: 'volume'; key: string; activityAt: string; volume: VolumeWithStats };

export interface LibraryView {
  /** Séries + livres indépendants, du plus récemment actif au plus ancien. */
  items: LibraryItem[];
  /** Tome mis en avant : en cours de lecture le plus récemment actif, sinon le plus récent. */
  featured: VolumeWithStats | null;
  volumeCount: number;
}

const activityOf = (v: VolumeWithStats) => (v.lastSessionAt && v.lastSessionAt > v.updatedAt ? v.lastSessionAt : v.updatedAt);

export async function loadLibrary(db: DbLike): Promise<LibraryView> {
  const [series, volumes] = await Promise.all([listSeries(db), listVolumes(db)]);
  const items: LibraryItem[] = [
    ...series.map((s) => ({ kind: 'series' as const, key: `s:${s.id}`, activityAt: s.activityAt, series: s })),
    ...volumes
      .filter((v) => v.seriesId === null)
      .map((v) => ({ kind: 'volume' as const, key: `v:${v.id}`, activityAt: activityOf(v), volume: v })),
  ].sort((a, b) => (a.activityAt < b.activityAt ? 1 : a.activityAt > b.activityAt ? -1 : 0));

  const byActivity = [...volumes].sort((a, b) => (activityOf(a) < activityOf(b) ? 1 : -1));
  const featured = byActivity.find((v) => v.status === 'reading') ?? byActivity[0] ?? null;
  return { items, featured, volumeCount: volumes.length };
}
