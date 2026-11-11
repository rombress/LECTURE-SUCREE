# Demande de relecture : transcription en direct en parallèle de l'enregistrement

- **Date** : 2026-11-11
- **Statut** : prête à envoyer
- **Décisions concernées** : D31 à D36

---

## Message pour le relecteur (à copier tel quel)

Bonjour. Je te demande une **relecture critique** d'un choix d'implémentation qui comporte un risque sur l'appareil. Cherche les failles.

### Contexte
- App iOS personnelle (React Native 0.88 + Expo SDK 58), installée sur un iPhone 14 Pro Max sous **iOS 27.0** via AltServer et un compte Apple gratuit. Compilation non signée sur GitHub Actions `macos-26`. Développement sous Windows, sans Mac. Budget 0 €.
- **Validé sur l'iPhone** : enregistrement vocal AAC mono 64 kbit/s avec `expo-audio` (AVAudioRecorder), fichier écrit directement dans Documents ; pause et reprise ; écran verrouillé ; interruption par un appel ; mode avion ; réécoute ; export.
- **Nouveau, non testé sur l'appareil** : transcription française en direct avec `expo-speech-recognition` 58.0.1 (SFSpeechRecognizer + AVAudioEngine). Ce module était déjà présent dans les builds : aucun code natif n'a changé.

### Implémentation
1. **L'audio d'abord.** On démarre AVAudioRecorder (expo-audio, catégorie `playAndRecord`, mode `default`, options `defaultToSpeaker` + Bluetooth HFP, `allowsBackgroundRecording`). On lance ensuite la reconnaissance **en parallèle**, avec `continuous: true`, `interimResults: true`, `requiresOnDeviceRecognition: true`, `addsPunctuation: true`, `iosTaskHint: 'dictation'`.
2. **Session audio.** On passe `iosCategory` au moteur avec **les mêmes valeurs** qu'expo-audio. Sinon, le moteur passerait la session en mode `measurement` pendant l'enregistrement. Le code Swift du moteur ne fait jamais `setActive(false)`.
3. **Sémantique iOS 18+**, lue dans le Swift du module : un résultat « final » arrive à chaque pause de parole (`speechRecognitionMetadata.speechDuration > 0`), et le texte suivant repart de zéro. L'accumulateur valide chaque final et dédoublonne un final de fin de tâche qui répéterait ou cumulerait le texte.
4. **Relances.** Quand iOS termine une tâche, une nouvelle est relancée après 400 ms. On abandonne au-delà de 6 relances en 60 s sans texte. Les erreurs `not-allowed`, `language-not-supported` et `service-not-allowed` rendent la transcription « indisponible », **et l'enregistrement continue**.
5. **Persistance.** Chaque énoncé validé est écrit tout de suite (en ajout seul), et un brouillon toutes les 5 s. Texte brut et texte corrigeable sont séparés. Après un plantage, on récupère le texte partiel.
6. **Repli.** Une transcription différée depuis le fichier m4a (`audioSource.uri`, sur l'appareil) est proposée si le direct a échoué.
7. **Tests.** 96 tests Jest, dont un faux moteur scriptable et des tests de mutation. Aucun test sur l'appareil pour l'instant.

### Questions
1. **AVAudioRecorder et AVAudioEngine (tap sur `inputNode`) peuvent-ils capturer le micro en même temps dans la même app sur iOS 27**, sans silence, coupure ni dégradation de l'un ou de l'autre ? Connais-tu des cas documentés d'échec (par exemple, le format d'entrée à 0 Hz si le micro est « occupé ») ?
2. Le fait que le moteur rappelle `setCategory` et `setActive(true)` à **chaque relance de tâche** (toutes les pauses de parole) pendant l'enregistrement peut-il provoquer de brèves interruptions de l'AVAudioRecorder, même avec des valeurs identiques ?
3. Avec un **écran verrouillé** et `UIBackgroundModes=audio`, SFSpeechRecognizer sur l'appareil continue-t-il de transcrire, ou faut-il s'attendre à un arrêt ? Une relance de tâche en arrière-plan est-elle autorisée ?
4. En cas d'échec de la double capture, préfères-tu : (a) une **capture unique** par le moteur de reconnaissance, avec `recordingOptions.persist` (fichier PCM, sans le validé expo-audio) ; (b) un **module Swift local** avec un seul AVAudioEngine qui alimente un fichier AAC et `SpeechAnalyzer` (iOS 26+) ; ou (c) l'enregistrement seul, suivi d'une transcription du fichier ?
5. Pour `SpeechAnalyzer`/`SpeechTranscriber` (iOS 26+) : vois-tu un avantage décisif pour la transcription **en direct** en français, qui justifierait de passer tout de suite à l'option (b) ?

Merci d'indiquer, pour chaque affirmation, si elle est **vérifiée** (avec une source) ou **supposée**.

---

## Réponse du relecteur

*(à coller ici)*

## Analyse de la réponse

*(confrontation au code, aux tests et aux essais sur iPhone)*
