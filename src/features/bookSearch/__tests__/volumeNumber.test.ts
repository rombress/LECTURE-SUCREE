import { volumeFromCatalog, volumeFromTitle } from '../volumeNumber';

describe('numéro de tome depuis un champ du catalogue', () => {
  it('« 001 » → 1, sûr', () => {
    expect(volumeFromCatalog('001')).toEqual({ label: '1', number: 1, kind: 'regular', origin: 'catalog', confident: true });
  });
  it('volume décimal', () => {
    expect(volumeFromCatalog('14,5')).toMatchObject({ label: '14.5', number: 14.5, kind: 'decimal' });
  });
  it('chiffres romains et nombres en lettres', () => {
    expect(volumeFromCatalog('IV')?.number).toBe(4);
    expect(volumeFromCatalog('Volume deux')?.number).toBe(2);
  });
  it('libellé non numérique → null (rien d’inventé)', () => {
    expect(volumeFromCatalog('final')).toBeNull();
    expect(volumeFromCatalog('')).toBeNull();
  });
  it('intégrale signalée par le contexte', () => {
    expect(volumeFromCatalog('1', 'Saga fictive : intégrale')?.kind).toBe('omnibus');
  });
});

describe('numéro de tome déduit du titre', () => {
  it('marqueurs explicites : Vol., Tome, Ep.', () => {
    expect(volumeFromTitle('Saga Fictive, Vol. 3')).toMatchObject({ number: 3, origin: 'title', confident: true });
    expect(volumeFromTitle('Saga Fictive Tome 12')?.number).toBe(12);
    expect(volumeFromTitle('サーガ―Ep.5 ―副題―')?.number).toBe(5);
  });
  it('volume intermédiaire 14.5', () => {
    expect(volumeFromTitle('Saga Fictive Vol. 14.5')).toMatchObject({ label: '14.5', number: 14.5, kind: 'decimal' });
  });
  it('coffret « Vol. 1-12 » → intégrale/coffret', () => {
    expect(volumeFromTitle('Saga Fictive Light Novel 12-Book Set Vol.1-12')).toMatchObject({ label: '1-12', kind: 'omnibus' });
  });
  it('hors-série / spin-off « Alter. 1 »', () => {
    expect(volumeFromTitle('Saga Fictive Alter. 1: Histoire annexe')).toMatchObject({ kind: 'special', label: 'Alter 1', number: 1 });
  });
  it('le nombre qui fait partie du nom de la série n’est pas un tome', () => {
    expect(volumeFromTitle('42', '42')).toBeNull();
    expect(volumeFromTitle('42')).toBeNull();
    expect(volumeFromTitle('42 : quarante-deux', '42')).toBeNull();
  });
  it('chiffres pleine chasse convertis', () => {
    expect(volumeFromTitle('Ｓａｇａ Vol. ３')?.number).toBe(3);
  });
  it('nombre isolé en fin de titre : accepté mais NON sûr', () => {
    expect(volumeFromTitle('Saga Fictive 19')).toMatchObject({ number: 19, confident: false });
    expect(volumeFromTitle('Saga Fictive 25 (light Novel)')).toMatchObject({ number: 25, confident: false });
    expect(volumeFromTitle('Saga Fictive 2: Sous-titre (light novel)')).toMatchObject({ number: 2, confident: false });
    expect(volumeFromTitle('Saga Fictive [13]')).toMatchObject({ number: 13, confident: false });
  });
  it('une année n’est pas un numéro de tome', () => {
    expect(volumeFromTitle('Agenda 2020-2021')).toBeNull();
  });
  it('titre sans numéro → null', () => {
    expect(volumeFromTitle('Saga Fictive')).toBeNull();
  });
});
