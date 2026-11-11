/**
 * Le moteur de reconnaissance natif est UNIQUE pour toute l'app et ses
 * événements ne disent pas à quelle tâche ils appartiennent. Ce verrou
 * garantit qu'une seule utilisation (direct OU fichier) est active à la fois :
 * prendre le verrou annule d'abord l'utilisation précédente et attend sa fin.
 */
export interface EngineHolder {
  /** Annule l'utilisation en cours ; résout quand le moteur est libéré. */
  cancel: () => Promise<void>;
}

let current: EngineHolder | null = null;

export async function acquireEngine(holder: EngineHolder): Promise<() => void> {
  if (current && current !== holder) {
    const previous = current;
    current = null;
    await previous.cancel().catch(() => undefined);
  }
  current = holder;
  return () => {
    if (current === holder) current = null;
  };
}

export function engineHolder(): EngineHolder | null {
  return current;
}

/** Tests uniquement. */
export function __resetEngineLock() {
  current = null;
}
