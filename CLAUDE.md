# CLAUDE.md — Lecture sucrée

App mobile personnelle, **V1 iPhone uniquement** (Android en V2). Nom affiché : **Lecture sucrée**. Nom technique : `lecture-sucree`. Ne jamais utiliser « READLOG » comme nom. Le prototype `../READLOG-iOS-TEST` sert de référence technique, mais ses fichiers ne doivent jamais être mélangés à ce projet.

## Règles non négociables

- **Budget 0 €.** Pas d'EAS Build, pas d'Apple Developer Program, pas d'API ni de service payant, pas de runner GitHub « larger ». Signaler toute limite d'offre gratuite **avant** de l'utiliser.
- **Dépôt PUBLIC : aucune donnée personnelle.** Pas de bibliothèque réelle, notes, transcriptions, audio, base SQLite, sauvegarde, identifiant, jeton, clé ni certificat. Données de test **fictives** uniquement (`example.com`, « Auteur Fictif »).
- **Jamais `--no-verify`.** Si `scripts/privacy-check.mjs` bloque à tort, corriger la règle et ajouter un test.
- **Ne rien publier, pousser ni commiter sans accord explicite. Ne rien supprimer sans confirmation.**
- **Honnêteté** : distinguer *compilé*, *vérifié (local/CI)* et *testé sur appareil*. Consigner dans `docs/TEST-RESULTS.md`. Ne jamais affirmer qu'une chose est gratuite, compatible ou fonctionnelle sans l'avoir vérifiée.
- Travail **par lots** ([docs/ROADMAP.md](docs/ROADMAP.md)). Après chaque lot : tests, rapport, puis attente de validation.
- **V1 = iPhone uniquement** (D16). Aucun travail Android (APK, workflow, tests, compatibilité). Le code Android existant est conservé, pas supprimé.
- **Pile conservée** : React Native + Expo. Pour un besoin natif non couvert, écrire un module Swift local dans `modules/`, pas de migration (voir [docs/STACK-IOS.md](docs/STACK-IOS.md)).
- **Relecture externe (ChatGPT)** : pour toute décision architecturale importante, tout blocage technique ou risque significatif, préparer un message **autonome** (contexte, éléments vérifiables, options, recommandation, questions précises), l'enregistrer dans `docs/reviews/AAAA-MM-JJ-sujet.md`, puis le donner à l'utilisateur. Sa réponse est confrontée au code, aux tests et à la documentation ; elle n'est **jamais adoptée d'office**. Pas de demande de relecture pour les décisions mineures.

## Technique

- Expo SDK 58, RN 0.88, TypeScript strict. Ajout de dépendance : `npx.cmd expo install <pkg>`. Vérifier qu'`expo install` n'a pas recréé un `app.json` : la configuration vit uniquement dans `app.config.ts`.
- `ios/` et `android/` sont **générés** (`expo prebuild`) et jamais édités ni versionnés. Natif = `app.config.ts` + `plugins/` (+ futur `modules/` pour du Swift/Kotlin local).
- Logs : uniquement via `src/services/log.ts` (codes, pas de contenu). `console.*` est interdit par ESLint.
- Base : nouvelle migration = nouvelle entrée dans `src/data/db/migrations.ts`, sans jamais modifier une migration existante. `migrations.ts` n'importe rien (il est exécuté par Node dans les tests).
- Chemins de fichiers en base : **relatifs** au dossier privé (`src/data/files/paths.ts`).
- iOS : identifiant Apple **secondaire** uniquement, une seule instance d'AltServer, une seule tentative. Entitlements interdits (push, iCloud…) : le workflow échoue s'il en trouve.
- PowerShell bloque `npm.ps1` : utiliser `npm.cmd` / `npx.cmd`.

## Vérifier avant de déclarer une tâche finie

```powershell
npm.cmd run verify        # privacy:tracked + typecheck + lint + test (jest + node:test)
npm.cmd run doctor
npm.cmd run bundle:check
```
