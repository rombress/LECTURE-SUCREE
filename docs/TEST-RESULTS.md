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

## Recherche de livres (0.4.0, build 6) — 2026-11-12

| Niveau | Statut | Détail |
|---|---|---|
| 1. Bundle JS compilé | ✅ local | `tsc` 0 erreur ; ESLint 0 avertissement ; `expo-doctor` 20/20 ; bundle iOS 3,1 Mo |
| 2. App native compilée | ⏳ | Aucun module natif ajouté (`fetch`, expo-file-system et expo-image-manipulator déjà présents). Il faut un push autorisé, puis `ios-ipa` |
| 3. IPA installée | ⏳ | |
| 4. Testée sur iPhone | ⏳ | Protocole J |

| # | Test | Type | Statut | Détail |
|---|---|---|---|---|
| L1 | `npm run verify` | local | ✅ | **190 tests Jest réussis** (+ 1 ignoré : l'essai réseau, lancé sur demande) + **24 tests Node** |
| L2 | Nouveaux tests | local | ✅ | Données fictives uniquement. 80 tests Jest (ISBN, numéros de tome, format, BnF, Open Library, fusion et classement, recherche et erreurs réseau, doublons, ajout groupé sur un vrai SQLite) + 1 test Node (migration v1 → v2 avec données) |
| L3 | Mutations (4 défauts réintroduits) | local | ✅ | Tous détectés : couverture empruntée à une autre édition, couvertures non nettoyées après échec, sujets « manga » d'Open Library, doublons ignorés |
| L4 | Essai réel contre la BnF et Open Library (3 séries, depuis le PC) | réseau | ✅ | Détail dans `private/book-search-live.txt` (hors dépôt). Constats dans [BOOK-SEARCH.md](BOOK-SEARCH.md) §4. Trois défauts trouvés ainsi, puis corrigés : light novels classés mangas (sujets Open Library), mauvais auteur latin deviné, couvertures annoncées sans vérification |
| L5 | Migration v2 sur l'iPhone | appareil | ⏳ | J1 |

## Transcription : durcissement (0.3.1, build 5) — 2026-11-11

Suite à la relecture externe (ChatGPT) de l'architecture : conserver l'implémentation, la durcir avant le premier essai réel.

| # | Test | Type | Statut | Détail |
|---|---|---|---|---|
| T1 | `npm run verify` | local | ✅ | Confidentialité, TypeScript, ESLint (0 avertissement), **110 tests Jest + 23 tests Node** |
| T2 | Mutations (4 défauts réintroduits volontairement) | local | ✅ | Chacun fait échouer au moins un test : isolation des gestionnaires, anti-boucle des interruptions, écho final tardif, intermédiaires cumulés |
| T3 | Correctif Swift d'expo-speech-recognition appliqué par `postinstall` | local | ✅ | Appliqué une fois, idempotent, échec explicite si le code du module change (3 tests Node) |
| T4 | Compilation du Swift corrigé | CI | ✅ | Déduit : l'IPA 0.3.1 a été compilée par `ios-ipa` puis installée sur l'iPhone (numéro de run non consigné) |
| T5 | Bundle iOS (`expo export`) | local | ✅ | 3 Mo |
| T6 | `expo-doctor` | local | ⚠️ | 19/20 : des versions correctives d'Expo (ex. `expo` 58.0.23 → 58.0.24) sont parues le 2026-11-11. **Non mises à jour volontairement** avant l'essai sur iPhone. Sans rapport avec le code |
| T7 | Protocole court (section I) | appareil | ✅ (global) | 2026-11-12 : 0.3.1 installée et testée sur l'iPhone, I1 à I6 **tous OK** (voir ci-dessous) |

### Protocole I sur iPhone (0.3.1) — 2026-11-12

Rapport : **tous les tests OK** (déclaré par toi le 2026-11-12, sans message particulier rapporté).

| # | Statut | Message affiché / remarque |
|---|---|---|
| I1 | ✅ OK | |
| I2 | ✅ OK | |
| I3 | ✅ OK | |
| I4 | ✅ OK | |
| I5 | ✅ OK | |
| I6 | ✅ OK | |

## Lot Transcription (0.3.0, build 4) — 2026-11-11 (travail autonome)

| Niveau | Statut | Détail |
|---|---|---|
| 1. Bundle JS compilé | ✅ local | `tsc` 0 erreur ; ESLint typé 0 avertissement ; `expo-doctor` 20/20 ; bundle iOS 3 Mo |
| 2. App native compilée | ⏳ | Aucun code natif modifié (expo-speech-recognition déjà dans les builds). Il faut un push autorisé, puis `ios-ipa` |
| 3. IPA installée | ⏳ | |
| 4. Testée sur iPhone | ⏳ | **Rien de la transcription n'a tourné sur un appareil.** Protocole H |

Tests automatisés : **121** (101 Jest + 20 Node). Ce qu'ils couvrent :
- **Accumulateur** de texte selon la sémantique iOS 18+, lue dans le Swift du module.
- **Contrôleur en direct**, avec un faux moteur scriptable et une horloge simulée : relance automatique, anti-boucle limité aux échecs rapides, long silence toléré, erreurs bloquantes, interruption, arrêt différé pendant un démarrage, fins étrangères, libération pendant un démarrage, moteur muet à l'arrêt.
- **Verrou moteur** : un enregistrement en direct annule une transcription de fichier, sans mélanger les textes.
- **Transcription de fichier** : texte complet ou partiel, annulation, erreurs.
- **Persistance**, sur un vrai SQLite :
  - segments, brouillon, finalisation, recherche ;
  - correction sans effet sur l'audio ;
  - une correction n'est jamais écrasée, même pendant une retranscription ;
  - statut partiel ;
  - récupération après plantage.
- **Préférences** et garde-fou de confidentialité.

**Tests de mutation** : désactiver l'arrêt différé, le filtre des fins étrangères ou la règle des échecs rapides fait chaque fois échouer au moins un test.

**Relecture indépendante** : 9 défauts réels trouvés et corrigés. Le détail est dans [WORKLOG-TRANSCRIPTION.md](WORKLOG-TRANSCRIPTION.md).

## Lot Suppressions (0.2.1, build 3) — 2026-11-11

Retour de l'utilisateur sur la 0.2.0 : **les quatre tests prioritaires ont réussi sur iPhone** (F0, F3, F1/F5, F7).

| Niveau | Statut | Détail |
|---|---|---|
| 1. Bundle JS compilé | ✅ local | `tsc` 0 erreur ; ESLint typé 0 avertissement ; `expo-doctor` 20/20 ; bundle iOS 2,9 Mo |
| 2. App native compilée | ⏳ | Il faut un push (autorisation requise), puis `ios-ipa` |
| 3. IPA installée | ⏳ | |
| 4. Testée sur iPhone | ⏳ | Section G de [TEST-PROTOCOL-MVP.md](TEST-PROTOCOL-MVP.md) |

Tests automatisés : **81** (61 Jest + 20 Node). Nouveaux tests (`deletion.test.ts`, SQLite réel + système de fichiers simulé) :
- une session supprimée emporte ses segments, ses catégories, son entrée de recherche et son audio, et **rien d'autre** ;
- une session en cours ne peut pas être supprimée ;
- panne de la base : l'audio est restauré et la session reste intacte ;
- panne du fichier : rien n'est supprimé ;
- purge impossible : le fichier reste en corbeille, puis il est purgé au lancement ;
- résumé de suppression d'un livre ;
- suppression d'un livre : seuls ce livre, ses sessions et ses audios disparaissent ; l'autre tome, ses sessions et la série restent ;
- **panne au milieu de la transaction : annulation complète et audios restaurés** ;
- un livre en cours d'enregistrement ne peut pas être supprimé ;
- réparation au lancement après un plantage.

**Test de mutation** : en désactivant volontairement la restauration de l'audio, 1 test échoue ; le code d'origine a été rétabli ensuite (10/10 au vert).

## Lot Bibliothèque (0.2.0, build 2) — 2026-11-11

| Niveau | Statut | Détail |
|---|---|---|
| 1. Bundle JS compilé | ✅ local | `tsc` 0 erreur ; ESLint typé 0 avertissement ; `expo-doctor` 20/20 ; bundle iOS 2,9 Mo ; Info.plist introspecté (micro ✓, voix ✓, photos ✓, arrière-plan audio ✓, pas de caméra) |
| 2. App native compilée | ✅ CI | Run `ios-ipa` 43020252873 sur `baccf6c` (2026-11-11, de 12:25 à 12:42 UTC) : toutes les étapes vertes, inspection de l'IPA comprise ; artefact de 12,1 Mo |
| 3. IPA installée | ⏳ | Par-dessus la 0.1.0 : test E1 |
| 4. Testée sur iPhone | ⏳ | Section F de [TEST-PROTOCOL-MVP.md](TEST-PROTOCOL-MVP.md) |

Tests automatisés : **71** (51 Jest + 20 Node). Nouveaux tests (`series.test.ts`, SQLite réel, données fictives) :
- les données du MVP restent intactes sans migration ;
- tomes rangés dans l'ordre de leur numéro ;
- déplacer un tome (série A → B → indépendant) laisse les sessions **strictement identiques** (comparaison ligne à ligne) ;
- retirer une série laisse tomes, sessions et audios intacts, y compris avec les clés étrangères désactivées ;
- rattachement à une série inexistante refusé sans modification ;
- couverture de repli de la série ;
- règles de libellé.

**Relectures du lot :**
- **Auto-relecture.** Elle a trouvé un défaut, corrigé : sur iOS, le recadrage d'`expo-image-picker` est toujours carré (documenté), alors on importe sans recadrage.
- **Relecture indépendante** (agent séparé, lecture seule). **Aucun bug confirmé** ; les 6 exigences sont vérifiées : sessions jamais supprimées ni réassociées, retrait de série sans perte, déplacement sans perte, données du MVP sans migration, couvertures privées, non-régression audio.
- **Correctif retenu de cette relecture : risque d'arrêt pour manque de mémoire** à l'import d'une photo 48 MP. L'image est désormais sous-échantillonnée dès le décodage (`maxWidth`, vérifié dans `ImageDownsampling.swift`).
- Points mineurs **non corrigés** (aucune perte de données) :
  - fichiers de couverture orphelins après un échec d'enregistrement ou un retrait de série ;
  - message d'erreur générique si une série disparaît pendant l'édition d'un tome.

## MVP audio — 2026-11-11

| Niveau | Statut | Détail |
|---|---|---|
| 1. Bundle JS compilé | ✅ local | Bundle Hermes iOS de 2,9 Mo ; `tsc` 0 erreur ; ESLint typé 0 problème ; `expo-doctor` 20/20 |
| 2. App native compilée | ✅ CI | Run `ios-ipa` 43013538336 (2026-11-11, de 11:37 à 11:49 UTC, `macos-26`) : toutes les étapes vertes, y compris l'inspection bloquante de l'IPA (structure, `main.jsbundle`, arm64, clés micro/voix présentes, aucun entitlement interdit). Artefact `lecture-sucree-unsigned-ipa` de 11,5 Mo, expire le 2026-11-25. `ci` 43012762281 également vert |
| 3. IPA installée | ✅ appareil | 2026-11-11 : **iPhone 14 Pro Max, iOS 27.0**, AltServer avec l'identifiant Apple secondaire. Échec via AltStore en Wi-Fi (« AltServer could not find this device ») ; **réussite avec l'iPhone branché en USB** |
| 4. Testée sur iPhone | ✅ partiel | Rapporté par l'utilisateur le 2026-11-11 (voir le détail ci-dessous) |

### Résultats sur iPhone (rapportés par l'utilisateur, 2026-11-11)

| Test du protocole | Résultat |
|---|---|
| B1 Ajout de livre | ✅ |
| B4 Persistance après fermeture complète | ✅ |
| C2 Enregistrement de 30 s + réécoute | ✅ |
| C5 Écran verrouillé pendant l'enregistrement | ✅ |
| C7 Interruption | ✅ |
| C8 Mode avion | ✅ |
| C10 Sessions associées aux bons livres | ✅ |
| D3 Export vers Fichiers | ✅ |
| C3 Enregistrement de 10 min | ⏳ à tester |
| C1, C4, C6, C9, D1, D2, E1, E2 | non rapportés individuellement |

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
