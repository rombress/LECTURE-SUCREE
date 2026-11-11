# Journal des décisions

Légende : ✅ validé (preuve citée) · 🔶 décidé, à confirmer sur appareil · ⏳ ouvert

| # | Décision | Statut | Preuve / prochaine vérification |
|---|---|---|---|
| D1 | Développement sous Windows, compilation iOS non signée sur GitHub Actions `macos-26`, signature AltServer avec un identifiant Apple gratuit **secondaire** | ✅ | Prototype READLOG-iOS-TEST, iPhone physique, 2026-11-11 |
| D2 | Rafraîchissement 7 jours via AltStore | ⏳ | Indiqué comme validé dans la demande, mais le compte-rendu du prototype l'indique « à tester avant le 2026-11-18 ». **À confirmer** |
| D3 | Expo SDK 58 + React Native 0.88 + TypeScript, CNG (`ios/` et `android/` générés) | ✅ | Prototype + `tsc`, `expo-doctor` 20/20, bundles Hermes Android/iOS (2026-11-11) |
| D4 | Dépôt Git **propre** au dossier `LECTURE-SUCREE`, branche `main` | ✅ | `git init` (le dossier dépendait du dépôt parent `ProjetClaude`) |
| D5 | SQLite local (expo-sqlite), WAL, FTS5 sans accents, migrations par `user_version` | 🔶 | Schéma réel testé sous Node 24 (SQLite 3.53.4) ; à tester sur appareil via Diagnostic |
| D6 | Sessions rattachées à un tome ; série → tomes en `SET NULL` ; tome → sessions en `RESTRICT` | ✅ | `tests/node/schema.test.mjs` |
| D7 | Audio = source de vérité ; transcription brute et texte corrigé séparés ; segments écrits en ajout seul | 🔶 | Conception ; implémentation aux lots 1 et 3 |
| D8 | Transcription : moteur natif Apple sur l'appareil, avec repli enregistrement seul et transcription différée. Candidats : `SFSpeechRecognizer` (via expo-speech-recognition 58.0.1) **et** `SpeechAnalyzer` (iOS 26, via module Swift local) | 🔶 | Comparaison : [TRANSCRIPTION.md](TRANSCRIPTION.md). Décision après le spike du lot 1 sur l'iPhone |
| D9 | Audio original : **AAC mono 64 kbit/s (.m4a), ≈ 29 Mo/h**, enregistré par expo-audio **indépendamment de la transcription**, directement dans Documents, puis déplacé, haché (SHA-256) et jamais modifié | 🔶 | Adopté pour le MVP (relecture externe du 2026-11-11). À mesurer : lisibilité après un arrêt forcé (test C9) |
| D10 | Android `allowBackup=false` (pas d'envoi automatique vers Google) | ⏸ V2 | Vérifié dans le manifeste généré ; conservé pour la V2 |
| D11 | APK construit sur GitHub Actions ; clé release dans les secrets GitHub | ⏸ V2 | Workflow conservé, désormais en lancement manuel uniquement |
| D12 | Sauvegardes : archive `.lsbackup` vérifiée par SHA-256, d'abord par la feuille de partage ; API Drive directe (`drive.appdata`) en option | ⏳ | [STORAGE.md](STORAGE.md) : scope, mode Testing et bundle ID AltStore à vérifier |
| D13 | Protection du dépôt public : liste blanche + contrôle du contenu + historique + identité Git, en hooks et en CI | ✅ | 10 tests dans des dépôts jetables + exécution sur le vrai dépôt |
| D14 | Bundle ID / package : `com.lecturesucree.app` (aucune donnée personnelle) | 🔶 | AltStore pourrait le suffixer avec un compte gratuit : à observer |
| D15 | `expo-doctor` épinglé en 1.21.6 | ✅ | La 1.21.7, publiée le 2026-11-11, plante (`Cannot find module '@expo/env'`) |
| D16 | **V1 = iPhone uniquement.** Android reporté à une V2 : `platforms: ['ios']`, workflow APK en lancement manuel seulement, aucun test Android. Rien n'est supprimé | ✅ | Demande du 2026-11-11 |
| D17 | **React Native + Expo conservé** pour la V1 iOS. Pas de migration vers Swift ; un **module Swift local** est prévu si le spike le justifie (SpeechAnalyzer, capture unique AVAudioEngine + AAC, interruptions) | 🔶 | Analyse : [STACK-IOS.md](STACK-IOS.md). Relecture externe demandée : [reviews/](reviews/) |
| D18 | ESLint typé (`no-floating-promises`) : une promesse non attendue est une perte de données potentielle | ✅ | La règle a détecté le défaut `File.write()` non attendu (revue du lot 0) |
| D19 | Sauvegarde et restauration (lot 4) **avant** toute utilisation avec de vraies données | ⚠️ | Priorité n° 6 de la demande du 2026-11-11. Mise en tension par le souhait d'utiliser le MVP dès aujourd'hui : **décision du propriétaire attendue** (accepter le risque ou attendre) |
| D20 | MVP audio sans transcription livré avant le spike de transcription | ✅ | Relecture externe du 2026-11-11 ([reviews/](reviews/)) |
| D21 | Aucune suppression de livre ni de session dans le MVP | ✅ | Pas de perte possible par fausse manœuvre tant qu'il n'y a pas de sauvegarde |
| D22 | Séries et couvertures **sans migration SQLite** : le schéma v1 contenait déjà `series`, `volumes.series_id` (ON DELETE SET NULL), `sort_index`, `cover_path` | ✅ | Données du MVP testées intactes (`series.test.ts`) |
| D23 | Retirer une série détache **explicitement** ses tomes (UPDATE) avant de la supprimer, sans dépendre uniquement de la clé étrangère | ✅ | Testé, y compris avec `foreign_keys = OFF` |
| D24 | Couvertures : JPEG ≤ 900 px (sans agrandissement), copiées dans `Documents/lecture-sucree/covers/` ; pas de recadrage iOS (il serait carré) | ✅ | Doc expo-image-picker 58 : « on iOS the crop rectangle is always a square » |
| D25 | Plugin expo-image-picker : `microphonePermission` reçoit le texte du micro, **jamais `false`** (sinon la clé NSMicrophoneUsageDescription serait supprimée) ; caméra désactivée | ✅ | Code du plugin lu ; Info.plist introspecté (micro ✓, photos ✓, pas de caméra) |
| D26 | Position d'un tome déduite de son libellé (« Tome 3 » → 3, « Hors-série » en dernier) | ✅ | Testé |
| D27 | **Suppressions (0.2.1)** : remplace D21. Session, livre et série supprimables, avec confirmation iOS. Livre avec sessions : **double confirmation**, affichant le nombre de sessions et d'audios et la durée totale | ✅ | Demande du 2026-11-11 |
| D28 | Cohérence base ↔ fichiers par **corbeille interne** : audio déplacé → base modifiée (transaction pour un livre) → purge. En cas d'échec de la base, l'audio est restauré ; au lancement, `sweepTrash` restaure ou purge selon que la session existe encore | ✅ | 10 tests, dont des pannes simulées et un test de mutation |
| D29 | Supprimer une série ne supprime jamais ses tomes (rendus indépendants), leurs sessions ni leurs audios ; seule la copie de la couverture de la série est effacée | ✅ | Testé (`series.test.ts`, `deletion.test.ts`) |
| D30 | Archivage des livres (alternative à la suppression) | ❌ abandonné | Décision du propriétaire, 2026-11-11 |
| D31 | **Transcription V1 : `SFSpeechRecognizer` via expo-speech-recognition 58.0.1** (déjà compilé dans les IPA) **en parallèle** de l'enregistrement expo-audio, sans nouveau code natif. `SpeechAnalyzer` (iOS 26+, disponible sur l'iPhone sous iOS 27) reporté : il exige un module Swift, qui ne peut pas être compilé sans push | 🔶 | Code + 96 tests Jest ; ⏳ protocole H sur iPhone. Raison : livrer une version testable sans modifier le code natif pendant le travail autonome |
| D32 | **Sur l'appareil par défaut** (`requiresOnDeviceRecognition`) ; reconnaissance en ligne seulement si l'utilisateur l'autorise dans Réglages | ✅ | Confidentialité, hors-ligne |
| D33 | Session audio du moteur **identique** à celle d'expo-audio (`playAndRecord`, mode `default`, `defaultToSpeaker` + Bluetooth) | 🔶 | Lu dans les deux codes Swift ; effet réel ⏳ H3 |
| D34 | Relance automatique des tâches de reconnaissance (400 ms) ; abandon au-delà de 6 relances en 60 s sans texte | ✅ | Testé (faux moteur, horloge simulée) |
| D35 | Texte brut du moteur (`transcript_raw`) distinct du texte affiché et corrigeable (`transcript_text`) ; une correction n'est jamais écrasée ; retranscrire depuis l'audio demande une confirmation explicite | ✅ | Testé |
| D36 | Transcription différée d'un fichier (repli) avec le même moteur, en lecture seule de l'audio ; annulable ; résultat partiel signalé | 🔶 | Testé avec un faux moteur ; ⏳ H12 |
| D37 | **Verrou moteur** : une seule utilisation (direct ou fichier) à la fois ; un arrêt pendant un démarrage est différé jusqu'à l'événement natif `start` | ✅ | Relecture indépendante (bug 1) ; testé + mutation |
| D38 | **Hors-ligne exigé vérifiable** : sans autorisation du réseau, la transcription en direct n'a lieu que si l'iPhone est réglé en français. Sinon, refus explicite | ✅ | Swift du module : contrôle sur la langue de l'iPhone, et contrainte « sur l'appareil » retirée sans prévenir. **Si l'iPhone n'est pas en français, il faudra autoriser le réseau, ou passer à SpeechAnalyzer** |
| D39 | La transcription suit l'état réel de l'enregistreur (pause en interruption, reprise automatique) | ✅ | Relecture indépendante (bugs 2 et 3) |
| D40 | Relecture externe de l'architecture de transcription (ChatGPT, 2026-11-11) : **conserver** SFSpeechRecognizer en parallèle d'expo-audio pour le premier essai réel, **sans réécriture Swift**. Si le direct dégrade l'audio : enregistrement seul + transcription différée | ✅ | Décision du propriétaire après relecture |
| D41 | **Correctif Swift local** d'expo-speech-recognition 58.0.1 via `postinstall` : `setCategory` seulement si la configuration diffère. Échec explicite si le code du module change | 🔶 | 3 tests Node ; compilation ⏳ CI ; effet ⏳ I1 à I3 |
| D42 | Gestionnaires d'événements natifs isolés (try/catch) ; interruptions comptées par l'anti-boucle ; toute interruption marque le texte **partiel** | ✅ | Tests + mutations |
| D43 | Écho final écarté s'il n'est précédé d'aucun intermédiaire (direct), sinon fenêtre de 2 s (fichier) ; intermédiaires cumulés dédoublonnés | ✅ | Tests + mutations |
| D44 | Transcription écran verrouillé **non garantie**, annoncée comme telle dans l'app ; seul l'audio est garanti | ✅ | Écran d'enregistrement, protocole I4 |
| D45 | Mises à jour correctives d'Expo parues le 2026-11-11 **reportées** après l'essai sur iPhone (ne pas changer deux choses à la fois) | ✅ | `expo-doctor` 19/20, écarts de version corrective uniquement. Le workflow `ci` échouait pour cette seule raison : les 6 paquets sont **temporairement** exclus du contrôle (`expo.install.exclude` dans package.json), ce qui ne change aucune dépendance. **À retirer** lors de la mise à jour, après l'essai sur iPhone |
