import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { log } from '@/services/log';

/**
 * Recharge les données à chaque fois que l'écran reprend le focus (retour
 * depuis un formulaire ou un enregistrement). `load` doit être mémoïsée.
 */
export function useFocusLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);

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
    }, [load]),
  );

  return { data, failed };
}
