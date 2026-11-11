# Transcription vocale — comparaison et choix

> Règle : aucune promesse de transcription gratuite, illimitée ou hors ligne **sans preuve sur appareil**. Ce document distingue ce qui est **documenté** par les projets de ce qui est **vérifié** ici. Au 2026-11-11, rien n'est encore vérifié sur appareil : c'est l'objet du lot 1.

## État au 2026-11-11 (version 0.3.0) : implémenté, non testé sur iPhone

- **Choix** : `SFSpeechRecognizer` via expo-speech-recognition (A1 ci-dessous), **en parallèle** de l'enregistrement expo-audio. Sur l'appareil par défaut, français, continu, avec ponctuation. Voir D31 à D36 dans [DECISIONS.md](DECISIONS.md).
- **Pourquoi pas encore `SpeechAnalyzer`** : il exige un module Swift que l'on ne peut compiler qu'en poussant le code. Il reste le candidat n° 1 si les essais (protocole H) montrent des limites, par exemple des coupures ou l'écran verrouillé.
- **Fonctionnalités** :
  - texte affiché en direct ;
  - sauvegarde immédiate de chaque énoncé et d'un brouillon toutes les 5 s ;
  - relance automatique quand iOS termine une tâche ;
  - pause, reprise et interruption ;
  - correction du texte ;
  - transcription ou retranscription depuis l'audio ;
  - préférences : direct par défaut, reconnaissance en ligne interdite par défaut.
- **0.3.1 (durcissement après relecture externe)** :
  - **Session audio** : le module appelait `setCategory` à **chaque** relance. Un correctif Swift (`scripts/patch-speech-recognition.mjs`, appliqué par `postinstall`) ne l'appelle plus que si la configuration diffère. `setActive(true)` reste appelé : sans effet sur une session déjà active. Le module ne désactive jamais la session.
  - **Erreurs isolées** : chaque gestionnaire d'événement natif est protégé. Une exception dans la transcription ne peut pas fermer l'app pendant l'enregistrement.
  - **Interruptions** : comptées par l'anti-boucle, pour qu'une rafale (écran verrouillé) ne relance pas le moteur indéfiniment. Toute interruption marque le texte **partiel**, à compléter depuis l'audio.
  - **Doublons** : un écho final sans intermédiaire est écarté quel que soit le délai. Les intermédiaires cumulés ne réaffichent plus le texte déjà validé.
  - **Écran verrouillé** : la transcription n'y est **pas garantie**, et l'écran d'enregistrement le dit. Seul l'audio l'est.
- **Risque principal à vérifier (H3)** : la capture simultanée du micro par AVAudioRecorder et AVAudioEngine. Le moteur reconfigure la session audio à chaque relance de tâche, avec des valeurs identiques à celles d'expo-audio. Ce point est soumis à relecture externe dans [reviews/2026-11-11-transcription-en-direct.md](reviews/2026-11-11-transcription-en-direct.md).

## V1 iPhone : les candidats natifs Apple (mise à jour du 2026-11-11)

| | A1. `SFSpeechRecognizer` (via expo-speech-recognition 58.0.1) | A2. `SpeechAnalyzer` + `SpeechTranscriber` (iOS 26) |
|---|---|---|
| Disponibilité | iOS ≥ 16.4 (minimum de l'app) | **iOS 26 uniquement** |
| Accès depuis l'app | Module déjà installé | **Module Swift local à écrire** (expo-speech-recognition ne l'utilise pas, vérifié dans ses sources) |
| Sur l'appareil | Si l'iPhone a le modèle FR (`supportsOnDeviceRecognition`, à lire dans le Diagnostic) | Oui ; les modèles sont téléchargés par le système (`AssetInventory`) |
| Sessions longues | Limites historiques de durée par requête (≈ 1 min, surtout en mode réseau) ; le module enchaîne les requêtes en mode continu | Conçu pour la transcription longue, **sans la limite d'environ 1 min** (sources secondaires) |
| Français | À vérifier | À vérifier : `SpeechTranscriber.supportedLocales`. Un forum Apple signale des langues annoncées mais non fonctionnelles |
| Conservation audio | `recordingOptions.persist` (PCM) | À notre charge dans le module : capture AVAudioEngine → fichier AAC + flux vers l'analyseur |

**Plan du spike (lot 1)** : mesurer A1 sur l'iPhone ; si l'iPhone est sous iOS 26, écrire un module Swift minimal pour A2 et comparer à texte dicté identique. Whisper (B) reste le repli 100 % hors ligne si aucun moteur Apple ne convient.

Les sections suivantes, rédigées pour iOS **et** Android, restent valables comme référence. Les lignes Android ne concernent que la V2.

## Contraintes

- Voir le texte apparaître **en direct** pendant la dictée, en français.
- **Hors ligne** souhaité ; **0 €** obligatoire ; aucun envoi de données sans consentement.
- L'**audio original** doit être conservé même si la transcription échoue.
- Interruptions (appels, verrouillage, arrière-plan) sur iOS **et** Android.

## Options étudiées

| | A. Moteurs natifs via `expo-speech-recognition` | B. `whisper.rn` (whisper.cpp) | C. Vosk / sherpa-onnx | D. API cloud (Google STT, Deepgram, OpenAI…) |
|---|---|---|---|---|
| Licence / coût | Module MIT ; moteurs Apple/Google gratuits | MIT, modèles Whisper MIT | Apache 2.0 | **Payant** au-delà d'un quota d'essai |
| Temps réel | **Oui** (résultats intermédiaires) | Pseudo-temps réel : tranches de quelques secondes, latence visible | Oui (streaming) | Oui |
| Hors ligne | iOS : oui si l'appareil a le modèle FR sur l'appareil. Android 13+ : oui **après** téléchargement du modèle FR | **Oui**, toujours | Oui | Non |
| Confidentialité | Sur l'appareil = local. Mode réseau = audio envoyé à Apple/Google | Local | Local | Audio envoyé à un tiers |
| Conservation de l'audio par le moteur | Oui (`recordingOptions.persist`), iOS + Android 13+ | Oui (sortie WAV possible) | Selon intégration | — |
| Transcription d'un fichier existant | Oui (iOS, Android 13+) | Oui | Oui | Oui |
| Qualité FR | Bonne (dépend de l'appareil), ponctuation iOS / Android 13+ sur l'appareil | tiny : faible · base : correcte · small : bonne mais lente | Modèles FR plus petits, qualité moindre (à mesurer) | Très bonne |
| Coût appareil | Faible | **Élevé** (CPU, batterie, chauffe), surtout `small` | Moyen | Faible |
| Taille | 0 (moteur système) ; Android : pack de langue | Modèle 75 Mo (tiny) à 466 Mo (small), à télécharger une fois | ~40-100 Mo | 0 |
| Compatibilité Expo SDK 58 | Paquet versionné **58.0.1** (aligné SDK 58), installé ici | Non vérifiée sur RN 0.88 (annonce Old + New Architecture) | Bindings communautaires, non vérifiés | — |

### Limites documentées importantes

**A. Natif** (sources : README `expo-speech-recognition` 58.0.1, lu dans `node_modules`) :
- Android **≤ 12** : pas de mode continu, pas de reconnaissance sur l'appareil, pas de conservation audio, pas de transcription de fichier.
- Android : moteur fourni par l'app Google ou par *Android System Intelligence*. La disponibilité du français hors ligne dépend de l'appareil (`getSupportedLocales()` → `installedLocales`).
- iOS : en mode continu, la reconnaissance tourne jusqu'au résultat final (iOS 18+). Le mode **réseau** d'Apple est soumis à des limites de débit et de durée (non chiffrées ici). On impose donc `requiresOnDeviceRecognition` quand c'est possible.
- iOS : un événement `interrupted` est émis (appel, Siri, alarme).
- Audio conservé en **PCM non compressé** : Android 16 kHz mono ; iOS 32 bits flottant 44,1/48 kHz par défaut (≈ 690 Mo/h !). Il faudra imposer 16 kHz / 16 bits (≈ 1,9 Mo/min, ≈ 115 Mo/h). Voir « Stockage audio » plus bas.

**B. whisper.rn** (source : documentation du projet, non vérifiée ici) : l'API temps réel `RealtimeTranscriber` exige un adaptateur de flux audio (`@fugood/react-native-audio-pcm-stream`). À tester **en build Release** (le mode debug est jusqu'à 10× plus lent).

**D. Cloud** : écarté. Payant, quotas, et envoi de données personnelles à un tiers.

## Recommandation (à confirmer au lot 1)

**Architecture « audio d'abord » avec moteur interchangeable** (`src/services/transcription/engine.ts`) :

1. **Mode principal : A, moteur natif sur l'appareil**, une seule capture micro qui fournit à la fois le texte en direct et le fichier audio conservé.
2. **Repli automatique** si le moteur est indisponible ou échoue (Android ≤ 12, pas de modèle FR, erreur) : **enregistrement seul** avec expo-audio (AAC compact). La session est marquée « transcription en attente ».
3. **Transcription différée** du fichier : moteur natif (fichier) ou **B. whisper.rn** si le spike le valide.

Pourquoi pas B en mode principal : le temps réel y est moins fluide, la batterie et la chaleur en pâtissent, et il faut télécharger un modèle de plusieurs centaines de Mo pour une qualité FR correcte. B reste le meilleur candidat pour garantir une transcription **100 % hors ligne et identique** sur les deux plateformes. On ne le retiendra qu'avec des mesures réelles.

## Spike du lot 1 : ce qui sera mesuré sur VOS appareils

| Test | iOS | Android |
|---|---|---|
| Français sur l'appareil disponible ? (écran Diagnostic) | | |
| Dictée 10 min en continu : coupures ? latence ? | | |
| Mode avion : la transcription continue-t-elle ? | | |
| Audio conservé lisible, durée exacte, taille/min | | |
| Appel entrant pendant la dictée | | |
| Verrouillage de l'écran pendant 5 min | | |
| App en arrière-plan pendant 5 min | | |
| Casque Bluetooth branché/débranché | | |
| Double capture expo-audio + reconnaissance simultanées : possible ? | | |
| Build signé AltServer : les permissions micro/voix et l'arrière-plan fonctionnent-ils ? | | — |

## Stockage audio : décision à prendre au lot 1

Le PCM conservé par le moteur est volumineux (≈ 115 Mo par heure en 16 kHz/16 bits). Deux options :
- **Garder le WAV** : sans perte, simple, mais volumineux.
- **Convertir en AAC à la fin de la session** : environ 8 fois plus léger. Il faut alors un **module natif local** (iOS AVAssetExportSession, Android MediaCodec), qu'aucun module Expo ne fournit à ce jour. Le fichier AAC devient alors l'« original » conservé : c'est une compression avec perte, ce qui demande ta validation explicite.
