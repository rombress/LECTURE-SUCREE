import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { log } from '@/services/log';

/**
 * Recharge les données à chaque fois que l'écran reprend le focus (retour
 * depuis un formulaire ou un enregistrement), ou sur demande (`reload`,
 * ex. après une suppression). `load` doit être mémoïsée.
 */
export function useFocusLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      load()
        .then((d) => {
          if (alive) {
            setData(d);
            setFailed(false);
          }
        })
        .catch((e: unknown) => {
          log.error('screen.load_failed', { kind: e instanceof Error ? e.name : 'unknown' });
          if (alive) setFailed(true);
        });
      return () => {
        alive = false;
      };
      // `tick` force un rechargement sans changer de focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, tick]),
  );

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, failed, reload };
}
