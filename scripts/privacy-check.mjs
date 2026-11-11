#!/usr/bin/env node
/**
 * Lecture sucrée — contrôle de confidentialité du dépôt PUBLIC.
 *
 * Usage :
 *   node scripts/privacy-check.mjs --staged     # contenu indexé (pre-commit)
 *   node scripts/privacy-check.mjs --tracked    # tous les fichiers suivis
 *   node scripts/privacy-check.mjs --history    # tous les objets de l'historique
 *   (options combinables ; --identity est implicite avec --staged)
 *
 * Contrôles :
 *   1. Chemins interdits (données utilisateur, secrets, binaires de build).
 *   2. Liste blanche : tout fichier suivi doit appartenir à un emplacement
 *      prévu (code, docs, config). Un fichier inattendu bloque.
 *   3. Taille maximale.
 *   4. Signatures binaires (SQLite, audio, keystore…) même si l'extension ment.
 *   5. Motifs de secrets dans le texte (clés privées, jetons Google/GitHub…).
 *   6. Adresses e-mail (hors domaines réservés aux exemples).
 *   7. Mots interdits personnels listés dans `.privacy-denylist` (fichier LOCAL,
 *      ignoré par Git) ou dans la variable d'environnement PRIVACY_DENYLIST.
 *   8. Identité Git : l'e-mail d'auteur doit être une adresse noreply GitHub,
 *      sinon votre adresse réelle serait publiée dans l'historique.
 *
 * Les messages n'affichent JAMAIS la valeur détectée, seulement le fichier,
 * la ligne et la règle.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

/** Chemins interdits, quel que soit l'emplacement. */
export const FORBIDDEN_PATHS = [
  [/(^|\/)\.env(\.(?!example$)[^/]*)?$/i, 'fichier .env (secrets)'],
  [/\.(db|db-journal|db-wal|db-shm|sqlite3?|sqlite-(journal|wal|shm))$/i, 'base de données SQLite'],
  [/\.(m4a|mp3|wav|aac|caf|ogg|opus|flac|amr|3gp|webm)$/i, 'fichier audio'],
  [/\.(docx|lsbackup)$/i, 'export / sauvegarde'],
  [/\.(zip|7z|rar|tar|tgz|gz)$/i, 'archive'],
  [/\.(jks|keystore|p8|p12|pfx|pem|key|cer|crt|der|mobileprovision|provisionprofile|certSigningRequest)$/i, 'clé / certificat'],
  [/\.(ipa|apk|aab|xcarchive|hbc)$/i, 'binaire de compilation'],
  [/\.(bin|gguf|onnx)$/i, 'modèle / binaire volumineux'],
  [/(^|\/)(google-services\.json|GoogleService-Info\.plist|credentials\.json|keystore\.properties)$/i, 'fichier d’identifiants'],
  [/(^|\/)(client_secret|service-account)[^/]*\.json$/i, 'fichier d’identifiants Google'],
  [/(^|\/)\.privacy-denylist/i, 'liste locale de mots interdits'],
  [/(^|\/)(exports|backups|private|user-data|node_modules)\//i, 'dossier privé ou généré'],
  // Projets natifs GÉNÉRÉS : uniquement à la racine (un module Expo local
  // modules/<nom>/ios/*.swift est du code source légitime).
  [/^(ios|android)\//i, 'projet natif généré (expo prebuild)'],
];

/** Liste blanche : un fichier suivi doit correspondre à l'une de ces règles. */
export const ALLOWED_PATHS = [
  /^src\/.+\.(ts|tsx)$/,
  /^tests\/node\/.+\.(mjs|js|ts)$/,
  /^tests\/fixtures\/.+\.(json|txt|md)$/,
  /^scripts\/.+\.(mjs|js|py)$/,
  /^plugins\/.+\.js$/,
  // Modules Expo locaux (code natif Swift/Kotlin écrit à la main)
  /^modules\/[a-z0-9-]+\/(index\.ts|package\.json|expo-module\.config\.json)$/,
  /^modules\/[a-z0-9-]+\/src\/.+\.(ts|tsx)$/,
  /^modules\/[a-z0-9-]+\/ios\/[^/]+\.(swift|m|h|podspec)$/,
  /^modules\/[a-z0-9-]+\/android\/.+\.(kt|java|gradle|xml)$/,
  /^docs\/.+\.md$/,
  /^docs\/images\/.+\.(png|jpg|svg)$/,
  /^assets\/.+\.(png|jpg|ttf|otf|svg)$/,
  /^\.github\/workflows\/.+\.yml$/,
  /^\.github\/[A-Za-z_-]+\.(md|yml)$/,
  /^\.githooks\/(pre-commit|pre-push)$/,
  /^\.vscode\/extensions\.json$/,
  /^(README|CLAUDE|SECURITY|CHANGELOG)\.md$/,
  /^(package\.json|package-lock\.json|tsconfig\.json|app\.config\.ts|eslint\.config\.js|jest\.config\.js)$/,
  /^(\.gitignore|\.gitattributes|\.env\.example|\.nvmrc)$/,
];

const MAX_BYTES = 1_000_000;
const MAX_BYTES_ASSETS = 2_000_000;

/** Signatures binaires (magic numbers). */
const MAGIC = [
  [(b) => b.subarray(0, 16).toString('latin1') === 'SQLite format 3\u0000', 'base SQLite (signature)'],
  [(b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE', 'audio WAV (signature)'],
  [(b) => b.subarray(0, 3).toString('latin1') === 'ID3', 'audio MP3 (signature)'],
  [(b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && /^(M4A|M4B|mp42|isom|3gp)/.test(b.subarray(8, 12).toString('latin1')), 'audio/vidéo MP4 (signature)'],
  [(b) => b.subarray(0, 4).toString('latin1') === 'OggS', 'audio Ogg (signature)'],
  [(b) => b.subarray(0, 4).toString('latin1') === 'caff', 'audio CAF (signature)'],
  [(b) => b.length >= 4 && b.readUInt32BE(0) === 0xfeedfeed, 'keystore Java (signature)'],
  [(b) => b.subarray(0, 4).toString('latin1') === 'PK\u0003\u0004', 'archive ZIP / DOCX / IPA (signature)'],
];

/** Motifs de secrets (texte). Construits pour éviter les faux positifs. */
export const SECRET_PATTERNS = [
  [/-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----/, 'clé privée PEM'],
  [/\bya29\.[0-9A-Za-z_-]{20,}/, 'jeton d’accès Google OAuth'],
  [/\b1\/\/0[0-9A-Za-z_-]{20,}/, 'jeton de rafraîchissement Google OAuth'],
  [/\bGOCSPX-[0-9A-Za-z_-]{10,}/, 'secret client Google OAuth'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'clé API Google'],
  [/\b[0-9]{6,}-[0-9a-z]{32}\.apps\.googleusercontent\.com\b/, 'identifiant client OAuth Google réel'],
  [/\bgh[pousr]_[0-9A-Za-z]{30,}\b/, 'jeton GitHub'],
  [/\bgithub_pat_[0-9A-Za-z_]{30,}\b/, 'jeton GitHub (fine-grained)'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'clé AWS'],
  [/\bxox[abprs]-[0-9A-Za-z-]{10,}/, 'jeton Slack'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'clé API (format sk-)'],
  [/\b[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}\b/, 'mot de passe d’app Apple (format xxxx-xxxx-xxxx-xxxx)'],
  [/\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i, 'affectation de secret en clair'],
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/**
 * Adresses d'auteur Git volontairement FICTIVES et non identifiantes,
 * acceptées en plus des adresses noreply GitHub. Vérifiée le 2026-11-11 :
 * adresse factice du propriétaire, déjà présente dans ses commits publics.
 */
export const ALLOWED_AUTHOR_EMAILS = ['xxx@xxx.fr'];
/** Domaines réservés aux exemples (RFC 2606) et adresses techniques publiques. */
const EMAIL_ALLOWED = [
  ...ALLOWED_AUTHOR_EMAILS.map((e) => new RegExp(`^${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')),
  /@example\.(com|org|net)$/i,
  /\.(test|invalid|example|localhost)$/i,
  /^noreply@anthropic\.com$/i,
  /^[0-9]+\+?[A-Za-z0-9-]*@users\.noreply\.github\.com$/i,
];
/** Fichiers où les e-mails de tiers sont attendus (métadonnées de paquets). */
const EMAIL_SKIP_FILES = [/^package-lock\.json$/];

/** Fichiers exemptés des motifs de secrets (ils les DÉFINISSENT). */
const SECRET_SKIP_FILES = [/^scripts\/privacy-check\.mjs$/];

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

function git(args, opts = {}) {
  const r = spawnSync('git', args, { maxBuffer: 512 * 1024 * 1024, ...opts });
  if (r.status !== 0) {
    const err = r.stderr ? r.stderr.toString() : '';
    throw new Error(`git ${args.join(' ')} a échoué : ${err.trim()}`);
  }
  return r.stdout;
}

function repoRoot() {
  return git(['rev-parse', '--show-toplevel']).toString().trim();
}

function splitZ(buf) {
  return buf.toString('utf8').split('\0').filter(Boolean);
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

function loadDenylist(root) {
  const terms = [];
  const file = join(root, '.privacy-denylist');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith('#') && t.length >= 3) terms.push(t.toLowerCase());
    }
  }
  if (process.env.PRIVACY_DENYLIST) {
    for (const t of process.env.PRIVACY_DENYLIST.split(/[\n,]/)) {
      const v = t.trim();
      if (v.length >= 3) terms.push(v.toLowerCase());
    }
  }
  return terms;
}

function isProbablyText(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return true;
}

/**
 * Analyse un fichier. Retourne la liste des problèmes (sans jamais inclure la
 * valeur sensible détectée).
 * @param {string} path
 * @param {Buffer|null} content
 * @param {{ allowlist: boolean, denylist: string[] }} opts
 */
export function inspectFile(path, content, opts) {
  const issues = [];
  const p = path.replace(/\\/g, '/');

  for (const [re, label] of FORBIDDEN_PATHS) {
    if (re.test(p)) issues.push(`chemin interdit (${label})`);
  }
  if (opts.allowlist && !ALLOWED_PATHS.some((re) => re.test(p))) {
    issues.push('fichier hors liste blanche (ajoutez une règle à ALLOWED_PATHS seulement si c’est du code/doc public)');
  }
  if (!content) return issues;

  const max = p.startsWith('assets/') ? MAX_BYTES_ASSETS : MAX_BYTES;
  if (content.length > max && !/^package-lock\.json$/.test(p)) {
    issues.push(`fichier trop volumineux (${content.length} octets > ${max})`);
  }

  for (const [test, label] of MAGIC) {
    if (content.length >= 12 && test(content)) issues.push(`contenu binaire interdit : ${label}`);
  }

  if (!isProbablyText(content)) return issues;

  const text = content.toString('utf8');
  const lines = text.split(/\r?\n/);
  const checkSecrets = !SECRET_SKIP_FILES.some((re) => re.test(p));
  const checkEmails = checkSecrets && !EMAIL_SKIP_FILES.some((re) => re.test(p));

  lines.forEach((line, idx) => {
    const where = `ligne ${idx + 1}`;
    if (checkSecrets) {
      for (const [re, label] of SECRET_PATTERNS) {
        if (re.test(line)) issues.push(`${where} : ${label}`);
      }
    }
    if (checkEmails) {
      for (const m of line.match(EMAIL) ?? []) {
        if (!EMAIL_ALLOWED.some((re) => re.test(m))) issues.push(`${where} : adresse e-mail`);
      }
    }
    if (opts.denylist.length) {
      const low = line.toLowerCase();
      for (const term of opts.denylist) {
        if (low.includes(term)) issues.push(`${where} : terme personnel de .privacy-denylist`);
      }
    }
  });
  return issues;
}

function checkIdentity() {
  const r = spawnSync('git', ['config', 'user.email']);
  const email = r.stdout ? r.stdout.toString().trim() : '';
  if (!email) return ['identité Git : user.email non défini'];
  const allowed = ALLOWED_AUTHOR_EMAILS.some((e) => e.toLowerCase() === email.toLowerCase());
  if (!allowed && !/@users\.noreply\.github\.com$/i.test(email)) {
    return [
      'identité Git : user.email n’est ni une adresse noreply GitHub ni une adresse fictive autorisée (ALLOWED_AUTHOR_EMAILS). Votre e-mail réel serait publié dans l’historique public. ' +
        'Corrigez avec : git config user.email "<ID>+<pseudo>@users.noreply.github.com" (voir docs/SECURITY.md).',
    ];
  }
  return [];
}

function scanStaged(denylist) {
  const files = splitZ(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));
  return files.map((f) => [f, inspectFile(f, git(['show', `:${f}`]), { allowlist: true, denylist })]);
}

function scanTracked(denylist) {
  const files = splitZ(git(['ls-files', '-z']));
  return files.map((f) => [f, inspectFile(f, git(['show', `:${f}`]), { allowlist: true, denylist })]);
}

function scanHistory(denylist) {
  const results = [];
  const hasCommits = spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD']).status === 0;
  if (!hasCommits) return results;

  // Identités des commits (auteur + committer)
  const idents = git(['log', '--all', '--format=%H %ae %ce']).toString().trim().split('\n').filter(Boolean);
  for (const line of idents) {
    const [sha, ae, ce] = line.split(' ');
    for (const e of [ae, ce]) {
      if (e && !EMAIL_ALLOWED.some((re) => re.test(e))) {
        results.push([`commit ${sha.slice(0, 10)}`, ['e-mail d’auteur/committer non noreply publié dans l’historique']]);
      }
    }
  }

  // Objets avec chemin (blobs et arbres), dédoublonnés par (sha, chemin).
  const entries = [];
  const seen = new Set();
  for (const line of git(['rev-list', '--objects', '--all']).toString().split('\n')) {
    const sp = line.indexOf(' ');
    if (sp === -1) continue; // commit, ou objet sans chemin
    const sha = line.slice(0, sp);
    const path = line.slice(sp + 1);
    if (!seen.has(sha + path)) {
      seen.add(sha + path);
      entries.push({ sha, path });
    }
  }
  if (!entries.length) return results;

  // 1 seul appel pour les types, 1 seul appel pour les contenus (au lieu de
  // 2 processus par objet).
  const uniq = [...new Set(entries.map((e) => e.sha))];
  const types = new Map();
  const checkOut = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], { input: uniq.join('\n') + '\n' });
  for (const l of checkOut.toString().trim().split('\n')) {
    const [sha, type] = l.split(' ');
    types.set(sha, type);
  }
  const blobs = uniq.filter((s) => types.get(s) === 'blob');
  const contents = new Map();
  if (blobs.length) {
    const out = git(['cat-file', '--batch'], { input: blobs.join('\n') + '\n' });
    let pos = 0;
    while (pos < out.length) {
      const nl = out.indexOf(0x0a, pos);
      const [sha, , size] = out.subarray(pos, nl).toString().split(' ');
      const start = nl + 1;
      const end = start + Number(size);
      contents.set(sha, out.subarray(start, end));
      pos = end + 1; // saut du \n final
    }
  }
  for (const { sha, path } of entries) {
    const content = contents.get(sha);
    if (!content) continue; // arbre
    const issues = inspectFile(path, content, { allowlist: false, denylist });
    if (issues.length) results.push([`${path} (historique, blob ${sha.slice(0, 10)})`, issues]);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(argv) {
  const modes = new Set(argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2)));
  if (!modes.size) modes.add('tracked');
  const known = ['staged', 'tracked', 'history', 'identity'];
  for (const m of modes) {
    if (!known.includes(m)) {
      console.error(`[privacy] option inconnue --${m}`);
      return 2;
    }
  }

  const root = repoRoot();
  process.chdir(root);
  const denylist = loadDenylist(root);
  const problems = [];

  if (modes.has('staged') || modes.has('identity')) {
    for (const i of checkIdentity()) problems.push(['(configuration Git)', [i]]);
  }
  if (modes.has('staged')) problems.push(...scanStaged(denylist));
  if (modes.has('tracked')) problems.push(...scanTracked(denylist));
  if (modes.has('history')) problems.push(...scanHistory(denylist));

  const failing = problems.filter(([, issues]) => issues.length);
  const label = [...modes].join(' + ');
  if (!failing.length) {
    console.log(
      `[privacy] OK (${label}) — aucun problème détecté. Liste locale de mots interdits : ${denylist.length ? `${denylist.length} terme(s)` : 'absente'}.`,
    );
    return 0;
  }
  console.error(`[privacy] ÉCHEC (${label}) — ${failing.length} élément(s) bloquant(s) :`);
  for (const [file, issues] of failing) {
    console.error(`  ✗ ${file}`);
    for (const i of [...new Set(issues)]) console.error(`      - ${i}`);
  }
  console.error('\nAucune valeur sensible n’est affichée. Voir docs/SECURITY.md pour la marche à suivre.');
  return 1;
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isDirectRun) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`[privacy] erreur : ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
}
