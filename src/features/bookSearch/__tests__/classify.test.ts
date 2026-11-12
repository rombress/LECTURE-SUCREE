import { classifyFormat } from '../classify';

describe('format : light novel, manga, autre', () => {
  it('« light novel » explicite', () => {
    expect(classifyFormat({ title: 'Saga Fictive (Light Novel) Vol. 4' }).format).toBe('light_novel');
  });
  it('catalogué « Romans » par la BnF', () => {
    expect(classifyFormat({ title: 'Saga fictive', genres: ['Romans'] }).format).toBe('light_novel');
  });
  it('manga explicite, ou dessinateur mentionné', () => {
    expect(classifyFormat({ title: 'Saga Fictive, Vol. 2 (manga)' }).format).toBe('manga');
    expect(classifyFormat({ title: 'Saga fictive', responsibility: 'scénario, Auteur Fictif ; dessin, Dessinateur Fictif' }).format).toBe('manga');
    expect(classifyFormat({ title: 'Saga fictive girls', responsibility: 'comic, Dessinateur Fictif' }).format).toBe('manga');
  });
  it('non paginé + éditeur de mangas → manga (indices faibles concordants)', () => {
    expect(classifyFormat({ title: 'Saga fictive', publisher: 'Kana', physical: '1 vol. (non paginé [ca 192] p.) ; 18 cm' }).format).toBe('manga');
  });
  it('coloriage, agenda, livre audio, artbook → autre format', () => {
    expect(classifyFormat({ title: 'Livre de coloriage Saga Fictive' }).format).toBe('other');
    expect(classifyFormat({ title: 'Agenda 2020-2021 Saga Fictive' }).format).toBe('other');
    expect(classifyFormat({ title: 'Saga Fictive', physical: 'Audiobook' }).format).toBe('other');
    expect(classifyFormat({ title: 'Saga Fictive Artworks' }).format).toBe('other');
  });
  it('les sujets « manga » d’Open Library ne suffisent PAS (light novels mal étiquetés)', () => {
    expect(classifyFormat({ title: 'Saga Fictive Vol. 2', categories: ['Comics & graphic novels', 'manga', 'fantasy'] }).format).toBe('unknown');
  });
  it('indices forts contradictoires → non précisé, jamais deviné', () => {
    const r = classifyFormat({ title: 'Saga Fictive light novel (manga)' });
    expect(r.format).toBe('unknown');
    expect(r.reasons).toContain('indices contradictoires');
  });
  it('aucun indice → non précisé', () => {
    expect(classifyFormat({ title: 'Saga fictive' }).format).toBe('unknown');
  });
  it('roman illustré traduit du japonais → light novel probable', () => {
    expect(classifyFormat({ title: 'Saga fictive', responsibility: 'illustrations de Illustrateur Fictif', originalLanguage: 'jpn' }).format).toBe('light_novel');
  });
});
