# Journal — lot Transcription (travail autonome du 2026-11-11, à partir de 14 h 05)

> Ce journal est commité localement à chaque étape : il fait foi en cas d'interruption.
> **Rien n'est poussé** sans autorisation. **Rien n'est testé sur iPhone** pendant ce travail : tout résultat « appareil » reste ⏳.

## Précautions prises (14 h 05)

| Point | Constat / action |
|---|---|
| Mise en veille | PC fixe, délai de veille **« jamais »** (secteur et batterie), veille prolongée désactivée, seule la veille S3 existe (pas de veille moderne). Pas de veille automatique attendue |
| Bloqueur temporaire | En plus : processus PowerShell (PID 27864) qui tient une requête `SetThreadExecutionState(ES_CONTINUOUS \| ES_SYSTEM_REQUIRED)` pendant 2 h, puis s'arrête seul (vers 16 h 05). **Aucun réglage d'alimentation modifié**, rien à restaurer. N'empêche ni l'extinction de l'écran ni le verrouillage |
| Session verrouillée | Un verrouillage n'arrête pas les processus : Claude Code continue. **Limites** : une veille réelle (bouton, menu Démarrer), une coupure réseau, un redémarrage Windows Update ou une demande d'autorisation d'outil interrompent ou bloquent le travail jusqu'à ton retour |
| Point de reprise | Commit `942f677` (0.2.1, suppressions), **poussé** sur autorisation explicite (2e message du 2026-11-11). L'IPA 0.2.1 n'est pas encore compilée : il faut lancer `ios-ipa` sur GitHub |

## Décisions techniques (vérifiées dans le code des modules installés)

1. **Pas de nouveau module natif** : `expo-speech-recognition` 58.0.1 est **déjà compilé dans les IPA** depuis la 0.1.0. La transcription ne demande donc que du JavaScript, ce qui est vérifiable sous Windows sans push. Un module Swift (`SpeechAnalyzer`) ne pourrait même pas être compilé sans push, donc aucune modification de code natif n'est faite.
2. **Audio d'abord** : l'enregistrement AAC (expo-audio, validé sur iPhone) reste la source de vérité. La reconnaissance tourne **en parallèle**. Si elle échoue, l'enregistrement continue.
3. **Cohabitation des deux usages du micro** (lu dans le Swift) :
   - expo-speech-recognition ne désactive **jamais** la session audio (aucun `setActive(false)`) ;
   - au démarrage, il reconfigure la session (par défaut en mode `measurement`). On lui passe **exactement** la configuration d'expo-audio (`playAndRecord`, mode `default`, options `defaultToSpeaker` + Bluetooth) pour que cette reconfiguration ne change rien ;
   - reste **non vérifié sur appareil** : qu'AVAudioRecorder et AVAudioEngine captent bien le micro simultanément.

## Avancement

- [x] Précautions et point de reprise
- [x] Logique pure de transcription : accumulateur, contrôleur en direct, transcription de fichier. 20 tests, plus 2 tests de mutation détectés (commit local)
  - Sémantique lue dans le Swift du module : sur iOS 18+, un résultat « final » est émis à **chaque pause de parole** et le texte suivant repart de zéro. Un final de fin de tâche peut répéter ou cumuler le texte déjà validé : il est dédoublonné.
  - iOS termine régulièrement les tâches : relance automatique après 400 ms, abandon (« indisponible ») au-delà de 6 relances en 60 s sans aucun texte.
  - Erreurs bloquantes (`not-allowed`, `service-not-allowed`, `language-not-supported`) : transcription indisponible, **l'enregistrement continue**.
  - Interruption (appel) : pause de la transcription, reprise avec le bouton Reprendre.
- [x] Persistance, sans migration (colonnes et table `transcript_segments` présentes depuis le schéma v1). 8 tests (commit local) :
  - chaque énoncé validé est écrit immédiatement ;
  - brouillon (avec le texte en cours) toutes les 5 s ;
  - à l'arrêt, texte brut + texte affiché ;
  - **une correction de l'utilisateur n'est jamais écrasée** ;
  - corriger ne touche ni l'audio ni le texte brut ;
  - recherche plein texte à jour ;
  - après un plantage, le texte le plus complet entre brouillon et segments est conservé.
- [x] Intégration à l'enregistrement (14 h 15) :
  - la permission de reconnaissance et la disponibilité sont vérifiées **avant** de capter ; un refus n'empêche jamais l'enregistrement ;
  - la transcription démarre **après** `recorder.record()` ;
  - à l'arrêt, l'audio est finalisé **d'abord**, puis la transcription (une erreur de transcription ne remet pas en cause la session audio) ;
  - toutes les actions de transcription sont isolées par `safely()`.
- [x] Écrans (14 h 20) :
  - **enregistrement** : interrupteur « Transcription en direct », texte qui défile pendant la dictée, message d'état ;
  - **session** : texte, « Modifier le texte », « Transcrire l'audio » / « Retranscrire depuis l'audio » (avec confirmation) ;
  - **Réglages** : transcription en direct (activée par défaut), reconnaissance en ligne (désactivée par défaut).
- [x] Vérification complète (14 h 21) : version 0.3.0 (build 4) ; `verify` ✅ (96 Jest + 20 Node) ; `expo-doctor` 20/20 ; bundle iOS 3 Mo
- [x] Documentation : protocole H (16 tests sur iPhone), décisions D31 à D36, message de relecture pour ChatGPT
- [ ] Relecture indépendante (agent séparé) en cours
