/** @jest-environment node */
import { createTestDb } from '@/__testutils__/nodeDb';
import { createSeries } from '@/data/repositories/series';
import { createVolume, getVolume, updateVolume } from '@/data/repositories/volumes';

import { duplicatesWithinSelection, findDuplicate, loadExistingKeys } from '../duplicates';
import { importBatch, type CoverOps } from '../importBooks';

import { candidate, fakeIsbn } from './fixtures';

const NOW = '2026-11-12T10:00:00.000Z';
const vol = (n: number, extra: Parameters<typeof candidate>[0] = {}) =>
  candidate({
    id: `c${n}`,
    title: `Arc ${n}`,
    isbn: fakeIsbn(Number.isInteger(n) ? n : Math.round(n * 10)),
    volume: { label: String(n), number: n, kind: Number.isInteger(n) ? 'regular' : 'decimal', origin: 'catalog', confident: true },
    coverUrl: `https://covers.example.com/${n}.jpg`,
    ...extra,
  });

function fakeCovers(failOn: string[] = []): CoverOps & { persisted: string[]; discarded: string[] } {
  const persisted: string[] = [];
  const discarded: string[] = [];
  return {
    persisted,
    discarded,
    async download(url) {
      if (failOn.some((f) => url.includes(f))) throw new Error('404');
      return `cache://${url}`;
    },
    async persist(_p, owner) {
      const rel = `covers/${owner}.jpg`;
      persisted.push(rel);
      return rel;
    },
    discard(rel) {
      discarded.push(rel);
    },
  };
}

function ids() {
  let i = 0;
  return () => `00000000-0000-4000-8000-${String(++i).padStart(12, '0')}`;
}

async function seedExistingData(db: ReturnType<typeof createTestDb>) {
  // Données existantes FICTIVES : une série, un tome, une session avec audio et transcription.
  const s = await createSeries(db, 'serie-existante', { title: 'Saga fictive' }, NOW);
  await createVolume(db, 'tome-existant', { title: 'Arc 1', author: 'Auteur Fictif', volumeLabel: '1', seriesId: s.id, isbn: fakeIsbn(1) }, NOW);
  db.raw
    .prepare(
      `INSERT INTO reading_sessions (id, volume_id, started_at, utc_offset, state, audio_path, audio_sha256, transcript_raw, transcript_text, transcript_status, created_at, updated_at)
       VALUES ('sess-1','tome-existant',?, '+01:00','completed','audio/2026/sess-1.m4a','abc','texte brut fictif','texte corrigé fictif','complete',?,?)`,
    )
    .run(NOW, NOW, NOW);
}

describe('doublons', () => {
  it('même ISBN → doublon certain ; même titre mais autre numéro → pas un doublon', async () => {
    const db = createTestDb();
    await seedExistingData(db);
    const keys = await loadExistingKeys(db);
    expect(findDuplicate(vol(1, { title: 'Autre titre' }), keys)).toEqual({ kind: 'isbn', volumeId: 'tome-existant' });
    expect(findDuplicate(vol(1, { isbn: null }), keys)).toEqual({ kind: 'title', volumeId: 'tome-existant' });
    expect(findDuplicate(vol(2, { title: 'Arc 1', isbn: null }), keys)).toBeNull();
  });

  it('hors-série et intégrale : jamais pris pour le tome de même numéro', async () => {
    const db = createTestDb();
    await seedExistingData(db);
    const keys = await loadExistingKeys(db);
    const special = { label: 'Alter 1', number: 1, kind: 'special' as const, origin: 'title' as const, confident: true };
    const omnibus = { label: '1-12', number: 1, kind: 'omnibus' as const, origin: 'title' as const, confident: true };
    expect(findDuplicate(vol(1, { isbn: null, volume: special }), keys)).toBeNull();
    expect(findDuplicate(vol(1, { isbn: null, volume: omnibus }), keys)).toBeNull();
  });

  it('doublons à l’intérieur d’une sélection (même ISBN, ou même tome même langue)', () => {
    const dup = duplicatesWithinSelection([vol(1), vol(1, { id: 'copie' }), vol(2), vol(2, { id: 'en', language: 'eng', isbn: fakeIsbn(20) })]);
    expect([...dup]).toEqual(['copie']);
  });
});

describe('ajout groupé', () => {
  it('ajoute dans l’ordre des tomes, crée la série, ignore les doublons, préserve les données existantes', async () => {
    const db = createTestDb();
    await seedExistingData(db);
    const before = db.raw.prepare("SELECT * FROM reading_sessions WHERE id = 'sess-1'").get();
    const existingBefore = await getVolume(db, 'tome-existant');

    const covers = fakeCovers();
    const report = await importBatch(
      db,
      { items: [vol(3), vol(1), vol(2.5), vol(2)], series: { kind: 'new', title: 'Saga fictive (import)', author: null }, author: 'Auteur Fictif', newId: ids(), nowIso: NOW },
      covers,
    );

    expect(report.added.map((a) => a.volumeLabel)).toEqual(['2', '2.5', '3']);
    expect(report.skippedDuplicates).toEqual([{ title: 'Arc 1', volumeLabel: '1' }]);
    expect(report.coverFailures).toBe(0);
    const rows = db.raw.prepare('SELECT volume_label, sort_index, isbn, language, publisher, source_ref, series_id, cover_path FROM volumes WHERE series_id = ? ORDER BY sort_index').all(report.seriesId);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ volume_label: '2.5', sort_index: 2.5, isbn: fakeIsbn(25), language: 'fre', publisher: 'Éditions Fictives' });
    expect(rows.every((r) => typeof (r as { cover_path: unknown }).cover_path === 'string')).toBe(true);

    // Rien d'existant n'a bougé.
    expect(db.raw.prepare("SELECT * FROM reading_sessions WHERE id = 'sess-1'").get()).toEqual(before);
    expect(await getVolume(db, 'tome-existant')).toEqual(existingBefore);
    expect(db.raw.prepare('SELECT count(*) n FROM series').get()).toEqual({ n: 2 });
  });

  it('mention de provenance et de date enregistrée avec chaque couverture importée, jamais sans image', async () => {
    const db = createTestDb();
    await importBatch(
      db,
      {
        items: [vol(30, { coverSource: 'bnf' }), vol(31, { coverSource: 'openlibrary' }), vol(32, { coverSource: 'bnf' })],
        series: { kind: 'none' },
        author: 'Auteur Fictif',
        newId: ids(),
        nowIso: NOW,
      },
      fakeCovers(['/32.jpg']),
    );
    const rows = db.raw.prepare('SELECT volume_label, cover_path, cover_credit FROM volumes ORDER BY sort_index').all() as { cover_path: string | null; cover_credit: string | null }[];
    expect(rows[0]?.cover_credit).toBe('Couverture : Bibliothèque nationale de France, récupérée le 12/11/2026');
    expect(rows[1]?.cover_credit).toBe('Couverture : Open Library (Internet Archive), récupérée le 12/11/2026');
    expect(rows[2]).toMatchObject({ cover_path: null, cover_credit: null });
  });

  it('mention effacée quand l’utilisateur remplace ou retire la couverture ; conservée sinon', async () => {
    const db = createTestDb();
    await createVolume(db, 'v', { title: 'Arc', author: 'Auteur Fictif', coverPath: 'covers/a.jpg', coverCredit: 'Couverture : BnF' }, NOW);
    await updateVolume(db, 'v', { title: 'Arc modifié', author: 'Auteur Fictif' }, NOW);
    expect((await getVolume(db, 'v'))?.coverCredit).toBe('Couverture : BnF');
    await updateVolume(db, 'v', { title: 'Arc', author: 'Auteur Fictif', coverPath: 'covers/photo.jpg' }, NOW);
    expect((await getVolume(db, 'v'))?.coverCredit).toBeNull();
    await createVolume(db, 'w', { title: 'Sans image', author: 'Auteur Fictif', coverCredit: 'Couverture : BnF' }, NOW);
    expect((await getVolume(db, 'w'))?.coverCredit).toBeNull();
  });

  it('sélection revérifiée après relecture : même tome, même langue, deux ISBN → un seul ajouté ; autre série → gardé', async () => {
    const db = createTestDb();
    const r = await importBatch(
      db,
      {
        items: [vol(3), vol(3, { id: 'relie', isbn: fakeIsbn(33) }), vol(3, { id: 'autre-serie', isbn: fakeIsbn(34), seriesTitle: 'Saga fictive annexe' })],
        series: { kind: 'none' },
        author: 'Auteur Fictif',
        newId: ids(),
        nowIso: NOW,
      },
      fakeCovers(),
    );
    expect(r.added).toHaveLength(2);
    expect(r.skippedDuplicates).toHaveLength(1);
  });

  it('images temporaires du cache supprimées après copie', async () => {
    const covers = { ...fakeCovers(), pending: [] as string[] };
    const ops = { ...covers, discardPending: (u: string) => covers.pending.push(u) };
    await importBatch(createTestDb(), { items: [vol(50), vol(51)], series: { kind: 'none' }, author: 'Auteur Fictif', newId: ids(), nowIso: NOW }, ops);
    expect(covers.pending).toEqual(['cache://https://covers.example.com/50.jpg', 'cache://https://covers.example.com/51.jpg']);
  });

  it('série existante choisie : tomes rattachés, aucune nouvelle série', async () => {
    const db = createTestDb();
    await seedExistingData(db);
    const r = await importBatch(db, { items: [vol(2)], series: { kind: 'existing', seriesId: 'serie-existante' }, author: 'Auteur Fictif', newId: ids(), nowIso: NOW }, fakeCovers());
    expect(r.seriesId).toBe('serie-existante');
    expect(db.raw.prepare('SELECT count(*) n FROM volumes WHERE series_id = ?').get('serie-existante')).toEqual({ n: 2 });
    expect(db.raw.prepare('SELECT count(*) n FROM series').get()).toEqual({ n: 1 });
  });

  it('une couverture introuvable n’empêche pas l’ajout du tome', async () => {
    const db = createTestDb();
    const r = await importBatch(db, { items: [vol(4), vol(5)], series: { kind: 'none' }, author: 'Auteur Fictif', newId: ids(), nowIso: NOW }, fakeCovers(['/4.jpg']));
    expect(r.added).toHaveLength(2);
    expect(r.coverFailures).toBe(1);
    expect(db.raw.prepare('SELECT count(*) n FROM volumes WHERE cover_path IS NULL').get()).toEqual({ n: 1 });
  });

  it('métadonnées absentes : enregistrées comme absentes (null), jamais inventées', async () => {
    const db = createTestDb();
    await importBatch(
      db,
      { items: [vol(6, { pageCount: null, isbn: null, publisher: null, language: null, volume: null, coverUrl: null })], series: { kind: 'none' }, author: 'Auteur Fictif', newId: ids(), nowIso: NOW },
      fakeCovers(),
    );
    expect(db.raw.prepare('SELECT page_count, isbn, publisher, language, volume_label, cover_path FROM volumes').get()).toEqual({
      page_count: null,
      isbn: null,
      publisher: null,
      language: null,
      volume_label: null,
      cover_path: null,
    });
  });

  it('fiche invalide (titre trop long) : écartée AVANT l’écriture, les autres sont ajoutées', async () => {
    const db = createTestDb();
    const r = await importBatch(
      db,
      { items: [vol(7, { title: 'x'.repeat(400) }), vol(8)], series: { kind: 'none' }, author: 'Auteur Fictif', newId: ids(), nowIso: NOW },
      fakeCovers(),
    );
    expect(r.added.map((a) => a.volumeLabel)).toEqual(['8']);
    expect(r.skippedInvalid).toHaveLength(1);
  });

  it('échec en base : TOUT est annulé et les couvertures copiées sont supprimées', async () => {
    const db = createTestDb();
    // Un identifiant déjà pris fait échouer le 2e INSERT.
    await createVolume(db, 'pris', { title: 'Autre livre', author: 'Auteur Fictif' }, NOW);
    let n = 0;
    const covers = fakeCovers();
    await expect(
      importBatch(
        db,
        { items: [vol(10), vol(11)], series: { kind: 'new', title: 'Saga neuve', author: null }, author: 'Auteur Fictif', newId: () => (++n === 2 ? 'pris' : `id-${n}`), nowIso: NOW },
        covers,
      ),
    ).rejects.toThrow();
    expect(db.raw.prepare('SELECT count(*) n FROM volumes').get()).toEqual({ n: 1 });
    expect(db.raw.prepare('SELECT count(*) n FROM series').get()).toEqual({ n: 0 });
    expect(covers.discarded.sort()).toEqual(covers.persisted.sort());
    expect(covers.persisted.length).toBeGreaterThan(0);
  });

  it('auteur obligatoire', async () => {
    await expect(importBatch(createTestDb(), { items: [vol(1)], series: { kind: 'none' }, author: '  ', newId: ids(), nowIso: NOW }, fakeCovers())).rejects.toThrow();
  });
});
