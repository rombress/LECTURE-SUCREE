# Résultats de test

Légende : ✅ OK · ❌ KO · ⏳ non exécuté · ⚠️ OK avec réserve
Types : **local** = Windows 11, Node 24.20.0, npm 11.19.0 · **CI** = GitHub Actions · **appareil** = téléphone physique.

## Lot 0 — 2026-11-11

| # | Test | Type | Statut | Détail |
|---|---|---|---|---|
| 0.1 | `npm ci` depuis le lockfile | local | ✅ | Le script natif optionnel de `@parcel/watcher` (outil de dev) reste bloqué par npm 11 : choix volontaire |
| 0.2 | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) | local | ✅ | 0 erreur. Un défaut a été trouvé puis corrigé : TS 6 n'inclut plus les types Jest par défaut |
| 0.3 | ESLint (`eslint-config-expo` + `no-console`) | local | ✅ | 0 problème |
| 0.4 | Jest : log sans contenu perso, migrations, validation, chemins, thème | local | ✅ | 3 suites, 20 tests |
| 0.5 | `node:test` : **vrai schéma SQL** sur SQLite 3.53.4 (Node) | local | ✅ | 8 tests : retrait de série sans perte, RESTRICT, CHECK, FTS5 sans accents + triggers, cascades, ordre chronologique |
| 0.6 | `node:test` : contrôle de confidentialité dans des dépôts jetables | local | ✅ | 10 tests : extensions, signatures binaires renommées, secrets jamais affichés, e-mails, liste blanche, liste locale de mots interdits, identité Git, fichier déjà suivi, historique |
| 0.7 | `privacy-check --tracked` sur le vrai dépôt | local | ✅ | Il a d'abord détecté un `app.json` créé par `expo install` (retiré : doublon de `app.config.ts`) |
| 0.8 | Hook pre-commit réel (Git for Windows) | local | ✅ | 2 tentatives de commit **bloquées** (identité non noreply ; faux `.db`). Aucun commit créé |
| 0.9 | `expo-doctor` | local | ✅ | 20/20 avec la 1.21.6. La 1.21.7 (publiée le jour même) plante : outil épinglé. Le doctor a trouvé un vrai manque : `expo-asset`, depuis installé |
| 0.10 | `expo export` Android + iOS (bundles Hermes de production) | local | ✅ | 2,7 Mo / 2,8 Mo. Depuis D16 : iOS seul, 2,8 Mo en 15 s |
| 0.11 | `expo prebuild --platform android` sous Windows | local | ⏸ V2 | Était ✅ (manifeste, `allowBackup=false`, plugin de signature). Conservé pour référence, plus testé en V1 |
| 0.12 | Nom du projet Xcode généré | local | ✅ | `Lecturesucree` (ASCII), nom affiché inchangé |
| 0.13 | Syntaxe YAML des 3 workflows | local | ✅ | Syntaxe seulement : **ce n'est pas une exécution** |
| 0.14 | Workflow `ci` sur GitHub | CI | ⏳ | Dépôt non publié (ton accord est requis) |
| 0.15 | Workflow `android-apk` | CI | ⏸ V2 | Reporté (D16) |
| 0.16 | Workflow `ios-ipa` (`macos-26`) | CI | ⏳ | Lot 0-bis |
| 0.17 | APK installé sur Android | appareil | ⏸ V2 | Reporté (D16) |
| 0.18 | IPA via AltServer, écran Diagnostic sur iPhone (permissions micro/voix + arrière-plan avec un compte gratuit) | appareil | ⏳ | Lot 0-bis |

## MVP audio — 2026-11-11

| Niveau | Statut | Détail |
|---|---|---|
| 1. Bundle JS compilé | ✅ local | Bundle Hermes iOS de 2,9 Mo ; `tsc` 0 erreur ; ESLint typé 0 problème ; `expo-doctor` 20/20 |
| 2. App native compilée | ⏳ | Le workflow `ios-ipa` n'a jamais tourné (dépôt non publié) |
| 3. IPA installée | ⏳ | |
| 4. Testée sur iPhone | ⏳ | Protocole : [TEST-PROTOCOL-MVP.md](TEST-PROTOCOL-MVP.md) |

Tests automatisés : **60** (40 Jest + 20 Node). Ajout du 2026-11-11 : export d'un audio via le menu Partager (copie vérifiée par SHA-256, nom de fichier lisible et sûr, testé) et adresse d'auteur fictive autorisée (testé). Les nouveaux portent sur :
- les dépôts tomes et sessions exécutés sur un **vrai SQLite** (node:sqlite, schéma de production) : création, modification, validation, association session ↔ livre, tris, refus de réattacher ou d'écraser un audio, sauvegarde régulière qui ne rouvre pas une session close ;
- la récupération après plantage (audio conservé, idempotence, une erreur n'empêche pas les autres récupérations et ne supprime rien) ;
- les formats (durées, dates, saisie des pages).

**Non testable sans iPhone** : capture micro réelle, interruptions, arrière-plan, écran verrouillé, lecture, interface, permissions après signature AltServer, lisibilité d'un m4a après un arrêt forcé.

## Revue du lot 0 — 2026-11-11

Relecture du code, confrontée aux sources des modules installés et à des essais. **3 défauts réels trouvés et corrigés**, tous invisibles aux tests initiaux :

| # | Défaut | Conséquence probable sur l'iPhone | Preuve | Correction |
|---|---|---|---|---|
| R1 | Migrations exécutées sur `db` au lieu de `txn` dans `withExclusiveTransactionAsync` | Migration hors transaction, ou blocage « database is locked » au premier lancement | Doc d'expo-sqlite 58 : « Any queries inside the transaction must be executed on the `txn` object » | `src/data/db/database.ts` route les requêtes vers `txn` |
| R2 | `File.write()` non attendu (asynchrone dans le SDK 58) | Diagnostic du stockage faux ou instable ; ce même type d'erreur sur l'audio = perte de données | Types `NativeFileSystem.types.d.ts` : `write(): Promise<void>` | `await` ajouté, et règle ESLint typée `no-floating-promises`, **qui détecte bien le défaut quand on le réintroduit** |
| R3 | `WHERE temp.diag_fts MATCH …` | Le test FTS5 du Diagnostic aurait échoué (« no such column ») | Reproduit avec `node:sqlite` | Nom de table non qualifié |

Améliorations de la même revue :
- `privacy-check` : `ios/` et `android/` ne sont plus interdits qu'**à la racine** (ils auraient bloqué un futur module Swift `modules/<nom>/ios/`) ; liste blanche `modules/` ajoutée ; +1 test.
- `privacy-check --history` : 2 appels `git cat-file --batch` au lieu de 2 processus par objet (le test d'historique passe toujours).
- `globals` déclaré explicitement (il n'était qu'une dépendance transitive).

Après la revue : `verify` ✅ en 35 s (20 tests Jest + 19 tests Node), `expo-doctor` 20/20, bundle iOS ✅.

**Limite connue** : R1 à R3 sont corrigés à partir de la documentation et de reproductions locales. Leur bon fonctionnement sur l'iPhone sera confirmé par l'écran Diagnostic (lot 0-bis).

### Non testé à ce stade (et pourquoi)
- Toute exécution sur un appareil ou en CI : le dépôt n'est pas encore publié.
- La compilation native (Gradle, Xcode) : impossible sous Windows sans JDK ni SDK Android (absents), et impossible pour iOS par principe.
- Toute fonctionnalité audio ou de transcription : prévue au lot 1.
