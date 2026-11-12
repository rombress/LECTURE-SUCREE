/**
 * Format d'une édition : light novel, manga, autre (coloriage, agenda,
 * livre audio, artbook…) ou non précisé.
 *
 * Indices FORTS (mention explicite dans le catalogue) et FAIBLES (éditeur,
 * pagination). En cas de contradiction entre indices forts, le format reste
 * « non précisé » plutôt que deviné. Les raisons sont conservées pour être
 * affichées.
 */
import { normalizeForMatch } from './text';
import type { BookFormat } from './types';

export interface FormatSignals {
  title: string;
  subtitle?: string | null;
  /** Mentions de responsabilité (« dessin, X », « comic, Y », « illustrations, Z »). */
  responsibility?: string | null;
  publisher?: string | null;
  /** Forme / genre catalogué (BnF 608 : « Romans », « Mangas »). */
  genres?: readonly string[];
  /** Description matérielle (« 1 vol. (non paginé [ca 192] p.) ; 18 cm », « Audiobook »). */
  physical?: string | null;
  originalLanguage?: string | null;
  pageCount?: number | null;
  categories?: readonly string[];
}

// Éditeurs dont le catalogue est (presque) exclusivement d'un format.
// Indice FAIBLE seulement : un éditeur peut changer de ligne éditoriale.
const LN_PUBLISHERS = ['ofelbe', 'maho', 'yen on', 'j novel club', 'airship', 'cross infinite world', 'light novel'];
const MANGA_PUBLISHERS = [
  'ototo', 'delcourt tonkam', 'tonkam', 'kana', 'pika', 'ki oon', 'kurokawa', 'kaze', 'glenat manga', 'panini manga',
  'soleil manga', 'doki doki', 'meian', 'akata', 'kodansha comics', 'viz media', 'vertical comics',
];

const OTHER_PATTERNS: [RegExp, string][] = [
  [/\b(coloriage|coloring|colouring)\b/, 'livre de coloriage'],
  [/\b(agenda|planner|calendrier|calendar)\b/, 'agenda ou calendrier'],
  [/\b(carnet|notebook|journal intime|sketchbook|log book|logbook|message book|composition book)\b/, 'carnet'],
  [/\b(audiobook|livre audio|audio cd|disque compact|blu ray|dvd)\b/, 'livre audio ou vidéo'],
  [/\b(artbook|art book|artworks|illustrations collection|visual book)\b/, 'artbook'],
];

export function classifyFormat(s: FormatSignals): { format: BookFormat; reasons: string[] } {
  const text = normalizeForMatch([s.title, s.subtitle, s.responsibility].filter(Boolean).join(' '));
  const phys = normalizeForMatch(s.physical);
  const pub = normalizeForMatch(s.publisher);
  const genres = (s.genres ?? []).map(normalizeForMatch);
  const cats = (s.categories ?? []).map(normalizeForMatch);
  const reasons: string[] = [];

  for (const [re, why] of OTHER_PATTERNS) {
    if (re.test(text) || re.test(phys)) return { format: 'other', reasons: [why] };
  }

  let lnStrong = false;
  let mangaStrong = false;
  let ln = 0;
  let manga = 0;

  if (/\blight novels?\b/.test(text)) {
    lnStrong = true;
    reasons.push('« light novel » indiqué');
  } else if (cats.some((c) => c.includes('light novel'))) {
    ln++;
    reasons.push('sujet « light novel »');
  }
  if (genres.some((g) => g.startsWith('roman'))) {
    lnStrong = true;
    reasons.push('catalogué comme roman');
  }
  if (/\b(manga|mangas|manhwa|comic|comics|bande dessinee|graphic novel)\b/.test(text) || genres.some((g) => /manga|bande dessinee/.test(g))) {
    mangaStrong = true;
    reasons.push('manga ou bande dessinée indiqué');
  }
  if (/\bdessin\b|\bdessins de\b|\bart by\b/.test(text)) {
    mangaStrong = true;
    reasons.push('dessinateur mentionné');
  }
  // Les sujets d'Open Library ne servent PAS à repérer les mangas : vérifié le
  // 2026-11-12, des light novels y sont étiquetés « Comics & graphic novels, manga ».

  if (LN_PUBLISHERS.some((p) => pub.includes(p))) {
    ln++;
    reasons.push('éditeur de light novels');
  }
  if (MANGA_PUBLISHERS.some((p) => pub.includes(p))) {
    manga++;
    reasons.push('éditeur de mangas');
  }
  if (/\bnon pagine\b/.test(phys)) {
    manga++;
    reasons.push('non paginé');
  }
  if (s.originalLanguage === 'jpn' && /\billustrations?\b/.test(text) && !mangaStrong) {
    ln++;
    reasons.push('roman illustré traduit du japonais');
  }

  if (lnStrong && mangaStrong) return { format: 'unknown', reasons: [...reasons, 'indices contradictoires'] };
  if (mangaStrong) return { format: 'manga', reasons };
  if (lnStrong) return { format: 'light_novel', reasons };
  if (manga > ln) return { format: 'manga', reasons };
  if (ln > manga) return { format: 'light_novel', reasons };
  return { format: 'unknown', reasons };
}
