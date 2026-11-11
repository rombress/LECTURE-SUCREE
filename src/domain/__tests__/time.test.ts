import { coverShade } from '@/components/CoverArt';
import { parseOptionalInt } from '@/features/library/VolumeForm';
import { exportFileName } from '@/features/recording/shareAudio';

import { formatDateTime, formatDuration, utcOffsetOf } from '../time';

describe('formats', () => {
  it('durées', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(42_500)).toBe('0:42');
    expect(formatDuration(725_000)).toBe('12:05');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('décalage horaire au format ±HH:MM', () => {
    expect(utcOffsetOf(new Date())).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  it('date en français, et tiret si la date est invalide', () => {
    expect(formatDateTime('2026-11-11T10:00:00.000Z')).toMatch(/2026 à \d{2}:\d{2}$/);
    expect(formatDateTime('pas une date')).toBe('—');
  });

  it('saisie de nombres de pages', () => {
    expect(parseOptionalInt('')).toBeNull();
    expect(parseOptionalInt(' 42 ')).toBe(42);
    expect(parseOptionalInt('4.2')).toBeNaN();
    expect(parseOptionalInt('-1')).toBeNaN();
  });

  it('nom de fichier d’export lisible et sûr', () => {
    const n = exportFileName('Tome 1 : la Nuit / le Jour?', '2026-11-11T20:05:00.000Z');
    expect(n).toMatch(/^Lecture sucrée - Tome 1 la Nuit le Jour - 2026-11-1\d \d{2}h05\.m4a$/);
    expect(n).not.toMatch(/[/\\:*?"<>|]/);
    expect(exportFileName('   ', 'invalide')).toBe('Lecture sucrée - Sans titre - date inconnue.m4a');
    expect(exportFileName('x'.repeat(200), '2026-01-01T00:00:00Z').length).toBeLessThan(110);
  });

  it('couleur de couverture stable pour un même titre', () => {
    expect(coverShade('Dune')).toBe(coverShade('Dune'));
    expect(coverShade('')).toMatch(/^#/);
  });
});
