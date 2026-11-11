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
 * cette tâche : il est dédoublonné.
 *
 * Pur et déterministe : testé sans appareil.
 */

export function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export class TranscriptAccumulator {
  /** Énoncés validés (toutes tâches confondues), dans l'ordre. */
  private committed: string[] = [];
  /** Énoncés validés dans la tâche de reconnaissance courante (dédoublonnage). */
  private taskCommitted: string[] = [];
  private interim = '';

  constructor(initialSegments: string[] = []) {
    this.committed = initialSegments.map(normalizeSpaces).filter(Boolean);
  }

  /** Traite un résultat. Retourne les énoncés NOUVELLEMENT validés (à persister). */
  onResult(rawText: string, isFinal: boolean): string[] {
    const text = normalizeSpaces(rawText);
    if (!isFinal) {
      this.interim = text;
      return [];
    }
    this.interim = '';
    if (!text) return [];
    const taskJoined = this.taskCommitted.join(' ');
    const last = this.taskCommitted[this.taskCommitted.length - 1];
    let toAdd = text;
    if (text === last || text === taskJoined) return []; // répétition
    if (taskJoined && text.startsWith(`${taskJoined} `)) toAdd = text.slice(taskJoined.length + 1); // cumul de la tâche
    return this.commit(toAdd);
  }

  /** Fin d'une tâche (arrêt, pause, coupure) : le texte intermédiaire est validé. */
  onTaskEnd(): string[] {
    const pending = this.interim;
    this.interim = '';
    const added = pending ? this.commit(pending) : [];
    this.taskCommitted = [];
    return added;
  }

  private commit(text: string): string[] {
    const t = normalizeSpaces(text);
    if (!t) return [];
    this.committed.push(t);
    this.taskCommitted.push(t);
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
