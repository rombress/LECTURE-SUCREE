/**
 * Assemble le texte reconnu à partir des événements du moteur iOS
 * (expo-speech-recognition 58, sémantique lue dans son code Swift) :
 *  - résultat intermédiaire (isFinal=false) : texte de l'énoncé EN COURS,
 *    révisé à chaque événement (il remplace le précédent) ;
 *  - résultat final (isFinal=true) : énoncé terminé (pause de parole) →
 *    validé définitivement. Sur iOS 18+, il est émis à chaque pause et le
 *    texte suivant repart de zéro ;
 *  - fin de tâche : l'éventuel texte intermédiaire restant est validé.
 * Un résultat final de fin de tâche peut RÉPÉTER du texte déjà validé dans
 * cette tâche : il est dédoublonné. Un final identique au dernier énoncé (ou
 * au cumul de la tâche) est un ÉCHO :
 *  - en direct (des résultats intermédiaires existent) : s'il n'a été
 *    précédé d'AUCUN résultat intermédiaire depuis la dernière validation,
 *    quel que soit le délai (ex. arrêt 5 s après la dernière phrase). Une
 *    vraie répétition (« Oui. … Oui. ») passe toujours par des
 *    intermédiaires : elle est conservée ;
 *  - sans intermédiaires (fichier) : s'il arrive moins de REPEAT_WINDOW_MS
 *    après la validation précédente.
 * Certains moteurs renvoient des intermédiaires CUMULÉS (texte de toute la
 * tâche) : la partie déjà validée en est retirée, pour ne pas l'afficher deux
 * fois.
 *
 * Pur et déterministe : testé sans appareil.
 */

export function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export const REPEAT_WINDOW_MS = 2000;

export class TranscriptAccumulator {
  private lastCommitAt = -Infinity;
  /** Énoncés validés (toutes tâches confondues), dans l'ordre. */
  private committed: string[] = [];
  /** Énoncés validés dans la tâche de reconnaissance courante (dédoublonnage). */
  private taskCommitted: string[] = [];
  private interim = '';
  /** Au moins un résultat intermédiaire reçu (mode direct). */
  private sawInterim = false;
  /** Un intermédiaire non vide est arrivé depuis la dernière validation. */
  private interimSinceCommit = false;

  constructor(
    initialSegments: string[] = [],
    private readonly now: () => number = () => Date.now(),
  ) {
    this.committed = initialSegments.map(normalizeSpaces).filter(Boolean);
  }

  /** Traite un résultat. Retourne les énoncés NOUVELLEMENT validés (à persister). */
  onResult(rawText: string, isFinal: boolean): string[] {
    const text = normalizeSpaces(rawText);
    const taskJoined = this.taskCommitted.join(' ');
    // Partie nouvelle d'un texte cumulé (toute la tâche) ; '' si rien de neuf.
    const fresh = taskJoined && (text === taskJoined || text.startsWith(`${taskJoined} `)) ? text.slice(taskJoined.length).trim() : text;
    if (!isFinal) {
      this.interim = fresh;
      if (fresh) {
        this.sawInterim = true;
        this.interimSinceCommit = true;
      }
      return [];
    }
    const hadInterim = this.interimSinceCommit;
    this.interim = '';
    this.interimSinceCommit = false;
    if (!text) return [];
    const last = this.taskCommitted[this.taskCommitted.length - 1];
    if (text === last || text === taskJoined) {
      const echo = this.sawInterim ? !hadInterim : this.now() - this.lastCommitAt < REPEAT_WINDOW_MS;
      if (echo) return []; // écho de fin de tâche
      return this.commit(text); // vraie répétition
    }
    return this.commit(fresh);
  }

  /** Fin d'une tâche (arrêt, pause, coupure) : le texte intermédiaire est validé. */
  onTaskEnd(): string[] {
    const pending = this.interim;
    this.interim = '';
    this.interimSinceCommit = false;
    const added = pending ? this.commit(pending) : [];
    this.taskCommitted = [];
    return added;
  }

  private commit(text: string): string[] {
    const t = normalizeSpaces(text);
    if (!t) return [];
    this.committed.push(t);
    this.taskCommitted.push(t);
    this.lastCommitAt = this.now();
    return [t];
  }

  get segments(): readonly string[] {
    return this.committed;
  }

  get interimText(): string {
    return this.interim;
  }

  /** Texte complet affiché : énoncés validés + énoncé en cours. */
  get fullText(): string {
    return [...this.committed, this.interim].filter(Boolean).join(' ');
  }
}
