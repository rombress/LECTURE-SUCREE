import { audioRelativePath, isSafeRelativePath } from '@/data/files/paths';
import { isHexColor, resolveScheme } from '@/theme/tokens';

import { CATEGORIES, VOLUME_STATUS_LABELS } from '../models';
import { isCategoryId, validateVolume } from '../validation';

describe('fiche tome', () => {
  it('exige titre et auteur', () => {
    const r = validateVolume({ title: '  ', author: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['author', 'title']);
  });

  it('accepte une fiche minimale (données fictives)', () => {
    expect(validateVolume({ title: 'Le Jardin des Fictions', author: 'A. Exemple' })).toEqual({ ok: true });
  });

  it('refuse une page actuelle au-delà du total', () => {
    const r = validateVolume({ title: 'T', author: 'A', pageCount: 100, currentPage: 101 });
    expect(r.ok).toBe(false);
  });

  it('refuse des pages non entières ou négatives', () => {
    expect(validateVolume({ title: 'T', author: 'A', pageCount: 0 }).ok).toBe(false);
    expect(validateVolume({ title: 'T', author: 'A', currentPage: -1 }).ok).toBe(false);
    expect(validateVolume({ title: 'T', author: 'A', pageCount: 10.5 }).ok).toBe(false);
  });
});

describe('référentiels', () => {
  it('contient les 11 catégories demandées', () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual([
      'Personnages',
      'Théories',
      'Intrigue',
      'Symbolisme',
      'Ressenti',
      'Citations',
      'Prédictions',
      'Incohérences',
      'Univers',
      'Relations',
      'Écriture',
    ]);
    expect(isCategoryId('quotes')).toBe(true);
    expect(isCategoryId('nope')).toBe(false);
  });

  it('contient les 5 statuts demandés', () => {
    expect(Object.values(VOLUME_STATUS_LABELS)).toEqual(['À lire', 'En cours', 'Terminé', 'En pause', 'Abandonné']);
  });
});

describe('chemins privés', () => {
  it('construit un chemin audio relatif sûr', () => {
    expect(audioRelativePath('3f2a-bc', '2026-11-11T10:00:00.000Z', 'wav')).toBe('audio/2026/3f2a-bc.wav');
  });
  it('refuse les tentatives de sortie du dossier', () => {
    expect(() => audioRelativePath('../x', '2026-01-01T00:00:00Z', 'wav')).toThrow();
    expect(isSafeRelativePath('audio/../../etc')).toBe(false);
    expect(isSafeRelativePath('/abs/path')).toBe(false);
    expect(isSafeRelativePath('file:///x')).toBe(false);
    expect(isSafeRelativePath('audio/2026/a.wav')).toBe(true);
  });
});

describe('thème', () => {
  it('résout le thème système, sombre par défaut', () => {
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('light', 'dark')).toBe('light');
  });
  it('valide les couleurs d’accent', () => {
    expect(isHexColor('#E0A458')).toBe(true);
    expect(isHexColor('red')).toBe(false);
  });
});
