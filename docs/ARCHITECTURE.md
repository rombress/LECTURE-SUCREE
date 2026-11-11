# Architecture — Lecture sucrée

> **V1 = iPhone uniquement** (D16) : les mentions d'Android ci-dessous sont une référence pour la V2.
>
> Statut : **lot 0 (fondations)**. Les choix marqués *à vérifier* seront confirmés ou révisés au lot 1 (spike audio/transcription sur appareils réels). Voir [DECISIONS.md](DECISIONS.md).

## 1. Vue d'ensemble

```
┌──────────────────────────── Téléphone (iOS / Android) ────────────────────────────┐
│  UI (expo-router, React Native)                                                    │
│   Bibliothèque · Fiche tome · Session vocale · Archives · Réglages · Diagnostic    │
│        │                                                                           │
│  Features (logique d'écran)  ──►  Domain (types, règles, validation : TS pur)      │
│        │                                                                           │
│  Services ── log (sans contenu perso) · transcription (port) · audio · export      │
│        │                                                                           │
│  Data ── SQLite (expo-sqlite, WAL, FTS5, migrations)                               │
│       └─ Fichiers privés (expo-file-system) : audio/, covers/, backups/            │
│                                                                                    │
│  Modules natifs : expo-audio · expo-speech-recognition · expo-sqlite · …           │
└────────────────────────────────────────────────────────────────────────────────────┘
        ▲ APK (Android)                         ▲ IPA re-signé par AltServer (iOS)
        │                                       │
GitHub Actions ubuntu (gratuit, public)   GitHub Actions macos-26 (gratuit, public)
        ▲                                       ▲
        └──────────── Code source public (ce dépôt) — AUCUNE donnée utilisateur ───┘
```

Principes :

1. **Local d'abord.** Toutes les données vivent dans le bac à sable privé de l'app. Rien ne sort sans action explicite de l'utilisateur (export, sauvegarde).
2. **L'audio est la source de vérité.** La transcription est un produit dérivé ; son échec n'empêche jamais la conservation de l'audio.
3. **Code public / données privées : séparation totale.** Le dépôt ne contient que du code, de la doc et des données de test fictives. Contrôle automatique : [SECURITY.md](SECURITY.md).
4. **Natif généré (CNG).** `ios/` et `android/` sont générés par `expo prebuild` et jamais versionnés. Toute configuration native passe par `app.config.ts` ou un *config plugin* (`plugins/`). Si un besoin natif n'est couvert par aucun module, il sera écrit en **module Expo local** (Swift/Kotlin, dossier `modules/`), compilé par la même chaîne.
5. **Testable sans appareil.** La logique (domaine, migrations, schéma SQL, confidentialité) est testée sous Windows ; ce qui dépend du matériel est vérifié par l'écran *Diagnostic technique* et les protocoles de test sur appareil.

## 2. Pile technique

| Besoin | Choix | Pourquoi | Statut |
|---|---|---|---|
| Langage / UI | TypeScript strict + React Native 0.88 | Un seul code pour iOS et Android, typage fort | ✅ compilé (tsc, bundles Hermes) |
| Cadre | **Expo SDK 58** (workflow CNG, pas Expo Go) | Modules natifs maintenus, config plugins, chaîne iOS gratuite **déjà validée** par le prototype | ✅ validé (prototype) |
| Navigation | expo-router (onglets + pile) | Navigation native (UINavigationController / Fragments), conventions mobiles | ✅ bundle OK, ⏳ appareil |
| Base de données | expo-sqlite (SQLite, WAL, FTS5) | Local, transactionnel, recherche plein texte intégrée, pas de serveur | ✅ schéma testé (Node), ⏳ appareil |
| Fichiers | expo-file-system (API `File`/`Directory`) | Stockage privé de l'app | ⏳ appareil (diagnostic) |
| Audio | expo-audio (enregistrement, arrière-plan, lecture) | Module officiel ; arrière-plan iOS (`UIBackgroundModes=audio`) et service de premier plan Android | ⏳ spike lot 1 |
| Transcription live | expo-speech-recognition (moteurs natifs, sur l'appareil en priorité) | Gratuit, vrai temps réel, peut conserver l'audio capté | ⏳ spike lot 1 — voir [TRANSCRIPTION.md](TRANSCRIPTION.md) |
| Transcription hors ligne (repli) | whisper.rn *(candidat)* | 100 % local et libre, même moteur sur les 2 plateformes | ⏳ non installé, à évaluer |
| Exports | `docx` (JS pur) + TXT/JSON + partage système | Aucun service externe | ⏳ lot Exports |
| Tests | Jest (jest-expo) + `node:test` avec `node:sqlite` | Le second exécute le **vrai SQL** du schéma sous Windows | ✅ 38 tests |
| CI / builds | GitHub Actions : ubuntu (CI + APK), macos-26 (IPA non signé) | Gratuit en dépôt public | ✅ syntaxe ; ⏳ 1er run |

## 3. Modèle de données (schéma v1)

```
series 1 ──── 0..n volumes 1 ──── 0..n reading_sessions 1 ──── 0..n transcript_segments
   (ON DELETE SET NULL)      (ON DELETE RESTRICT)            (ON DELETE CASCADE)
                                         │
                                         └── n..n categories (session_categories)
sessions_fts (FTS5, synchronisée par triggers)      app_settings (clé/valeur)
```

- **Retirer une série** → ses tomes deviennent indépendants (`SET NULL`) ; aucune session touchée. *Testé.*
- **Supprimer un tome qui a des sessions** → refusé par la base (`RESTRICT`). La suppression sera une action explicite et confirmée qui supprime d'abord sessions et fichiers audio. *Testé.*
- **Transcription** : `transcript_raw` (sortie brute du moteur, figée en fin de session) et `transcript_text` (texte affiché/exporté, corrigeable). L'audio est un fichier séparé dont l'empreinte SHA-256 est stockée.
- **Sauvegarde continue** : pendant l'enregistrement, chaque segment reconnu est ajouté dans `transcript_segments` (écriture en ajout seul). Un crash ou une interruption ne perd au plus que le segment en cours.
- **Dates** : ISO 8601 UTC + décalage horaire local (`utc_offset`) pour l'affichage et les exports.
- **Recherche** : FTS5 avec `remove_diacritics 2` (« theorie » trouve « Théorie »). *Testé sous Node.* Les filtres tome / auteur / date / catégorie / page sont des index SQL classiques.

Détails : [STORAGE.md](STORAGE.md).

## 4. Session vocale (conception, implémentée aux lots 1 et 3)

```
[Démarrer] → crée la session (state=recording, started_at) en base AVANT de capter
     │
     ├─ moteur natif disponible ? ── oui → capture unique : reconnaissance + audio conservé
     │                               │       segments → transcript_segments (ajout seul)
     │                               └ erreur moteur → bascule enregistrement seul (expo-audio)
     └─ non → enregistrement seul (expo-audio), transcription différée depuis le fichier
[Pause]/[Reprise] → state=paused / recording ; durée effective cumulée
[Interruption] (appel, Siri, alarme, verrouillage) → audio finalisé, state=interrupted,
                 proposition de reprise
[Arrêt] → finalise le fichier, calcule SHA-256, fige transcript_raw, state=completed
Au démarrage de l'app : toute session restée « recording » → récupération (audio + segments)
```

## 5. Arborescence

```
app.config.ts            configuration Expo (nom, permissions, plugins) — seule source
plugins/                 config plugins maison (signature Android par variables d'env.)
src/app/                 écrans (expo-router) : (tabs)/, diagnostic
src/components/          composants d'interface partagés
src/theme/               jetons de design (sombre/clair/système, accent), ThemeProvider
src/domain/              modèle métier et validation (TS pur, testé)
src/data/db/             migrations SQL, exécuteur, ouverture de la base
src/data/files/          organisation des fichiers privés (chemins relatifs sûrs)
src/services/            log (sans contenu perso), transcription (port)
src/features/            logique par fonctionnalité (diagnostic au lot 0)
tests/node/              tests Node : schéma SQLite réel, contrôle de confidentialité
scripts/                 privacy-check, installation des hooks, génération d'icônes
.githooks/               pre-commit / pre-push (contrôle de confidentialité)
.github/workflows/       ci, android-apk, ios-ipa
docs/                    cette documentation
assets/                  icônes (générées localement, provisoires)
```

## 6. Compatibilité visée

- **V1 : iPhone uniquement** (D16). **iOS ≥ 16.4** (minimum d'Expo SDK 58). La reconnaissance continue fiable demande iOS 17/18 ; `SpeechAnalyzer` demande iOS 26 (voir TRANSCRIPTION.md).
- **Pile** : React Native + Expo conservé ; un module Swift local (`modules/`) est prévu si le spike le justifie. Évaluation : [STACK-IOS.md](STACK-IOS.md).
- *Android (V2, référence)* : ≥ 7.0 (API 24) pour installer l'app, **Android 13+ recommandé**. La configuration est conservée dans `app.config.ts`, mais n'est ni construite ni testée en V1.
