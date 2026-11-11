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
- [x] Relecture indépendante (agent séparé, 14 h 25) : **9 défauts réels**, invisibles aux tests initiaux, tous corrigés (14 h 37, commit `37d29b1`) :
  1. Moteur natif partagé, événements non étiquetés. Un arrêt pendant un démarrage laissait une **tâche orpheline sur le micro**, et des fins périmées pouvaient créer une **boucle de relances**. Les transcriptions en direct et de fichier pouvaient se mélanger. → Verrou moteur exclusif ; arrêt différé jusqu'à l'événement natif `start` ; fins étrangères ignorées.
  2. Après une interruption reprise automatiquement par iOS, la transcription restait en pause. → Transcription synchronisée avec l'état réel de l'enregistreur.
  3. Les relances pouvaient réactiver la session audio pendant un appel. → Pause de la transcription dès que l'enregistreur est interrompu.
  4. **Confidentialité** : le contrôle « hors ligne » du module porte sur la langue de l'iPhone, et le module retire sans prévenir la contrainte « sur l'appareil ». → Hors-ligne exigé seulement s'il est vérifiable (iPhone en français), sinon refus explicite.
  5. Une retranscription partielle était marquée « complète ». → Statut `partial`.
  6. Une correction pouvait être écrasée par une retranscription encore en cours. → Annulation à la sortie de l'écran ; écriture seulement si le texte n'a pas changé.
  7. Une répétition volontaire (« Oui. Oui. ») était supprimée. → Dédoublonnage limité à 2 s.
  8. Le texte récupéré après un plantage pouvait être perdu. → Transaction unique.
  9. Le commentaire « l'audio d'abord » était faux. → L'audio est réellement arrêté en premier.
  - **Risque supplémentaire corrigé** : un long silence de lecture déclenchait l'anti-boucle et coupait la transcription **définitivement**. Désormais, seuls les échecs rapides (moins de 1,5 s) comptent.
  - Vérification : **101 tests Jest** + 20 Node. **3 tests de mutation** sur les correctifs principaux, tous détectés. `expo-doctor` 20/20. Bundle iOS ✅.

## Bilan (14 h 40)

- **Prêt** : code de la 0.3.0 (build 4) **commité en local**, non poussé. Une nouvelle IPA peut être compilée dès que le push est autorisé.
- **Rien n'a été testé sur iPhone.** Le protocole H de [TEST-PROTOCOL-MVP.md](TEST-PROTOCOL-MVP.md) dira si la transcription fonctionne réellement.
- **Message pour ChatGPT** prêt : [reviews/2026-11-11-transcription-en-direct.md](reviews/2026-11-11-transcription-en-direct.md).
