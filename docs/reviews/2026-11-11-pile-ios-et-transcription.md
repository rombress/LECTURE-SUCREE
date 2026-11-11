# Demande de relecture : pile technique de la V1 iPhone et stratégie de transcription

- **Date** : 2026-11-11
- **Statut** : réponse reçue et analysée (voir la fin du document)
- **Décisions concernées** : D17 (pile), D8 (transcription), D9 (format audio)

---

## Message pour le relecteur (à copier tel quel)

Bonjour. Je te demande une **relecture critique et indépendante** d'une décision d'architecture. Cherche les failles plutôt qu'une validation.

### Contexte
- Le projet est une app iOS **personnelle**, pour **un seul iPhone**. Ce n'est pas une publication App Store.
- Fonctions : un journal de lecture vocal. Une bibliothèque organisée en séries puis tomes ; des sessions où l'on dicte ses réflexions, avec l'**audio original conservé** et une **transcription française en direct** ; une recherche ; des exports DOCX, TXT et JSON ; des sauvegardes.
- Contraintes dures :
  - budget **0 €** ;
  - développement **sous Windows, sans Mac** ;
  - pas d'Apple Developer Program : l'installation passe par **AltStore/AltServer avec un compte Apple gratuit**, ce qui implique une signature de 7 jours, 3 apps au maximum, et aucun entitlement push, iCloud ou associated domains ;
  - aucun serveur ;
  - dépôt GitHub public, sans aucune donnée personnelle.
- La chaîne de compilation est **déjà validée sur un iPhone physique** avec un prototype Expo :
  1. Expo SDK 58 (React Native 0.88) ;
  2. GitHub Actions `macos-26` exécute `expo prebuild`, `pod install`, puis `xcodebuild` en Release `iphoneos` avec `CODE_SIGNING_ALLOWED=NO` ;
  3. le dossier `Payload/` est zippé en IPA ;
  4. AltServer re-signe l'IPA sous Windows avec un identifiant Apple **secondaire** (le compte principal a été verrouillé par Apple lors d'un essai) ;
  5. l'app se lance sur l'iPhone.

### Faits vérifiés dans le projet
- Fondations en React Native + Expo + TypeScript : SQLite (expo-sqlite, WAL, FTS5 sans accents), migrations testées, contrôle de confidentialité du dépôt. 39 tests automatisés passent sous Windows en 35 s, dont le **vrai schéma SQL** exécuté sur SQLite via Node. Le bundle iOS de production compile en local en 15 s. `expo-doctor` : 20/20.
- `expo-speech-recognition` 58.0.1 (installé) n'appelle **que `SFSpeechRecognizer`**, d'après ses sources Swift. Il sait conserver l'audio capté, mais en PCM non compressé (iOS : 32 bits flottant, 44,1 ou 48 kHz par défaut ; ≈ 115 Mo/h si l'on force 16 kHz/16 bits).
- iOS 26 apporte `SpeechAnalyzer` + `SpeechTranscriber` : transcription longue sur l'appareil, sans la limite d'environ 1 min de `SFSpeechRecognizer` (sources secondaires). Le français n'est **pas encore vérifié** ; un forum Apple signale des langues listées comme prises en charge mais non fonctionnelles.
- Aucun test sur l'appareil n'a encore été fait pour l'audio ou la transcription.

### Options
- **A.** Rester en React Native + Expo, avec uniquement des modules Expo existants.
- **B.** Migrer vers Swift/SwiftUI natif. Il faudrait générer le `.xcodeproj` sans Xcode (XcodeGen/Tuist sur le runner), sans compilateur iOS local, avec un retour de compilation uniquement via la CI macOS.
- **C. (recommandée)** Rester en React Native + Expo, et écrire un **module Expo local en Swift** (Expo Modules API, compilé par la même chaîne) **seulement si** un spike sur l'iPhone le justifie. Ce module couvrirait une capture unique AVAudioEngine qui alimente `SpeechAnalyzer` (iOS 26) **et** un fichier AAC, plus la gestion fine des interruptions AVAudioSession.

### Ma recommandation et sa justification
Je recommande C. Les avantages réels de Swift (accès aux API audio et vocales récentes) s'obtiennent avec un module local, alors que ses coûts sont immédiats :
- développement à l'aveugle sous Windows ;
- chaîne de compilation à re-valider ;
- travail déjà fait perdu ;
- réécriture complète pour un Android éventuel en V2.

Je reconsidérerais B si l'intégration d'un module Swift local échoue dans la chaîne Expo + `macos-26`, ou si la majorité du code utile se retrouve en Swift.

Architecture de session prévue, « audio d'abord » :
1. La session est créée en base avant la capture.
2. Les segments de transcription sont écrits en ajout seul.
3. L'audio est finalisé, son SHA-256 calculé, et le fichier n'est plus jamais modifié.
4. Le texte brut et le texte corrigé sont stockés séparément.
5. Si le moteur échoue, l'app bascule sur l'enregistrement seul, avec une transcription différée.

### Questions précises
1. Vois-tu un **avantage concret de B** que C ne couvre pas, compte tenu du développement sous Windows ?
2. Un **module Expo local en Swift** intégré via `expo prebuild` sur un runner macOS présente-t-il des pièges connus (autolinking, podspec, Swift concurrency, version minimale iOS) ?
3. Avec un **compte Apple gratuit** re-signé par AltServer, connais-tu des restrictions sur `SFSpeechRecognizer` ou `SpeechAnalyzer` (téléchargement de modèles via `AssetInventory`, `UIBackgroundModes=audio`, enregistrement écran verrouillé) ?
4. Pour garder un **audio original intègre**, préfères-tu un WAV 16 kHz/16 bits (sans perte, ≈ 115 Mo/h) ou un AAC encodé directement à la capture (≈ 8× plus léger, avec perte) ? Y a-t-il une raison de capter deux fois (un fichier, plus un flux pour la reconnaissance) plutôt qu'une ?
5. Quels **tests sur l'appareil** ajouterais-tu au protocole suivant ? Dictée de 10 min, mode avion, appel entrant, écran verrouillé 5 min, arrière-plan 5 min, casque Bluetooth, mise à jour de l'IPA et « Refresh » AltStore avec conservation des données.

Merci d'indiquer, pour chaque affirmation, si elle est **vérifiée** (avec une source) ou **supposée**.

---

## Réponse du relecteur (résumé fidèle)

1. **Option C, en deux étapes** : conserver Expo, et n'ajouter un module Swift que si les tests de transcription le justifient. Pas d'avantage décisif à SwiftUI.
2. **Module Expo local** : mécanisme officiellement pris en charge. Points à contrôler : `expo-module.config.json`, autolinking, podspec, compatibilité de la version minimale d'iOS avec SpeechAnalyzer, concurrence Swift, recompilation, et fonctionnement réel après signature par AltServer. « Compiler n'est pas fonctionner. »
3. **Compte gratuit et reconnaissance vocale** : pas de preuve que tout fonctionne avec une IPA re-signée. Vérifier sur l'iPhone la version d'iOS, le français, les autorisations, les modèles, le hors-ligne et l'écran verrouillé.
4. **Audio** : un AAC enregistré indépendamment de la transcription pour le MVP. « Original » signifie « jamais modifié », pas forcément « PCM ». ≈ 58 Mo/h à 128 kbit/s ; une seule capture si un module AVAudioEngine est écrit.
5. **Tests prioritaires** : persistance, enregistrements de 30 s et de 10 min, association au bon livre, réécoute après relance, refus du micro, interruption, verrouillage et arrière-plan, mise à jour de l'IPA, Refresh AltStore, sauvegarde et restauration. « Un checksum n'est pas une preuve de restauration. »
6. **Livraison aujourd'hui** : un MVP sans transcription (bibliothèque, ajout, fiche, enregistrement, stockage local, historique, réécoute, IPA). Ne pas sacrifier l'intégrité des données. Agents en parallèle si possible.
7. Distinguer bundle JS, app native compilée, IPA installée et fonctionnalité testée sur iPhone.

## Analyse de la réponse (confrontée au code et à la documentation)

| Point | Verdict | Justification |
|---|---|---|
| 1. Option C | ✅ adopté | Conforme à l'analyse [STACK-IOS.md](../STACK-IOS.md) (D17) |
| 2. Pièges d'un module local | ✅ adopté | Ajouté au protocole du lot Transcription. Rien à vérifier tant qu'aucun module n'est écrit |
| 3. Compte gratuit non prouvé | ✅ adopté | Déjà la position du projet (TEST-RESULTS 0.18) |
| 4. AAC indépendant pour le MVP | ✅ adopté, **avec une correction** | Le calcul de 128 kbit/s ≈ 57,6 Mo/h est juste, mais pour la voix, un AAC **mono 64 kbit/s** suffit : ≈ 29 Mo/h. Choix retenu (D9). Point vérifié dans le code d'expo-audio : l'enregistrement peut viser **directement Documents** (`directory: 'document'`) plutôt que le cache purgeable par iOS. C'est ce qui est utilisé |
| 5. Tests | ✅ adopté | Intégré à [TEST-PROTOCOL-MVP.md](../TEST-PROTOCOL-MVP.md). J'y ajoute l'**arrêt forcé pendant l'enregistrement**, qui est le vrai risque du format m4a |
| 6a. MVP sans transcription | ✅ adopté | Lot « MVP audio » ajouté à la feuille de route |
| 6b. Usage réel dès aujourd'hui | ⚠️ **réserve** | La réponse se contredit en partie : elle exclut la sauvegarde du MVP, mais liste « sauvegarde et restauration » parmi les tests à faire **avant tout usage réel**. Le MVP n'a **pas** de sauvegarde : supprimer l'app ou perdre l'iPhone efface tout. C'est la décision du propriétaire (D19) : accepter ce risque, ou attendre le lot Sauvegarde |
| 6c. Agents en parallèle | ❌ non retenu | Les écrans, les dépôts et l'enregistrement partagent les mêmes contrats (types, `DbLike`, chemins). Un seul intégrateur qui connaît tout le contexte est plus sûr qu'une coordination à plusieurs pour une trentaine de fichiers |
| 7. Quatre niveaux de validation | ✅ adopté | Formalisé dans TEST-RESULTS et dans le protocole |
