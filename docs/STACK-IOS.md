# V1 iPhone : React Native + Expo, ou Swift natif ?

> Décision D17, 2026-11-11. Contexte : la V1 cible **uniquement l'iPhone** (D16). Le développement se fait **sous Windows, sans Mac**, avec un budget de 0 €.

## Options comparées

- **A. Statu quo** : React Native + Expo (TypeScript), avec les modules Expo existants.
- **B. Swift natif** (SwiftUI) : réécriture complète.
- **C. Hybride** : React Native + Expo pour l'app, et **module Expo local en Swift** (`modules/…`) pour le cœur audio et transcription si les modules existants ne suffisent pas. Il est compilé par la même chaîne CI, sans « éjecter » Expo.

## Critères, avec les faits établis

| Critère | A. RN + Expo | B. Swift natif | C. Hybride |
|---|---|---|---|
| **Boucle de développement sous Windows** | Typecheck, lint, 39 tests et bundle iOS **en local**, en quelques dizaines de secondes (mesuré). Rechargement à chaud possible sur l'iPhone via `expo-dev-client` + Metro en Wi-Fi (*à vérifier*) | **Aucun compilateur iOS sous Windows** (pas de SDK UIKit/SwiftUI). Chaque compilation demande un run macOS en CI (plusieurs minutes, *à mesurer*). Pas d'aperçus SwiftUI, pas de simulateur local | Comme A pour 90 % du code ; seul le module Swift passe par la CI |
| **Chaîne iOS gratuite** | **Validée** sur iPhone (prototype, 2026-11-11) | À re-valider : il faudrait générer le `.xcodeproj` sans Xcode (XcodeGen/Tuist sur le runner). Faisable, mais non testé | Validée (A) ; un module local s'intègre via `expo prebuild` (*à vérifier au 1er module*) |
| **API Apple récentes** (SpeechAnalyzer iOS 26, AVAudioEngine, AVAudioSession) | Uniquement via les modules existants. `expo-speech-recognition` 58.0.1 n'utilise **que `SFSpeechRecognizer`** (vérifié dans ses sources Swift) | Accès direct et complet | **Accès direct et complet** dans le module Swift |
| **Qualité de l'interface** | Navigation native (react-native-screens), animations fluides possibles ; un rendu « 100 % SwiftUI » demande plus de soin | Meilleure intégration native | Comme A |
| **Tests automatisés sans Mac** | 39 tests locaux, dont le **vrai SQL** sur SQLite (Node) | XCTest uniquement sur runner macOS | Comme A, et XCTest pour le module |
| **Android en V2** | Domaine, base, interface et tests réutilisables | **Réécriture totale** | Réutilisable ; seul le module natif est à porter |
| **Contraintes du compte Apple gratuit** | Identiques | Identiques | Identiques |
| **Travail déjà fait** | Conservé | Perdu en grande partie (architecture et documentation seulement réutilisables) | Conservé |

## Ce qui justifierait du Swift, et comment l'obtenir sans migrer

Trois besoins concrets pourraient dépasser les modules Expo existants. **Tous sont accessibles en C :**

1. **SpeechAnalyzer / SpeechTranscriber (iOS 26)** : transcription longue sur l'appareil, sans la limite d'environ une minute de `SFSpeechRecognizer`. Modèles gérés par `AssetInventory`. La présence du français et la qualité **restent à vérifier sur l'iPhone** (un forum Apple signale des langues annoncées mais non fonctionnelles).
2. **Une seule capture micro** (AVAudioEngine) qui alimente à la fois la reconnaissance et un fichier **AAC compressé** : on évite le PCM d'environ 115 Mo/h et le conflit entre deux captures simultanées.
3. **Gestion fine des interruptions** (`AVAudioSession.interruptionNotification`, changements de route audio) et finalisation sûre du fichier.

## Conclusion

- **Une migration complète vers Swift n'est pas justifiée.** Ses avantages réels concernent l'accès aux API audio et vocales, et ils s'obtiennent avec un module Swift local (option C). Ses coûts sont concrets et immédiats : développement à l'aveugle sous Windows, chaîne de compilation à re-valider, travail perdu, réécriture pour Android en V2.
- **Décision : option A dès maintenant, option C si le spike du lot 1 le démontre.** Le spike comparera, sur l'iPhone réel, `expo-speech-recognition` (SFSpeechRecognizer) et un module Swift minimal utilisant SpeechAnalyzer (si iOS 26).
- **Critère de remise en cause** : si l'intégration d'un module Swift local échoue dans la chaîne Expo + `macos-26`, ou si la majorité du code utile se retrouve en Swift, la question de la migration sera rouverte avec des mesures à l'appui.
