# Feuille de route — V1 iPhone uniquement

> 2026-11-11 : **Android est reporté à une V2** (D16). Aucun temps n'est consacré aux APK, aux workflows ou aux tests Android en V1. Le code Android existant est conservé mais désactivé (pas supprimé).

Chaque lot se termine par : tests exécutés, erreurs vérifiées, liste des fichiers, résultats réels, ce qui reste à tester. **Puis attente de ta validation.** Les décisions importantes sont soumises à une relecture externe (voir `docs/reviews/`).

## Priorités V1 (dans l'ordre fixé)

1. App iOS installable sur ton iPhone via AltStore/AltServer, compte Apple gratuit.
2. Fonctionnement local fiable, sans serveur ni abonnement.
3. Bibliothèque élégante et fluide.
4. Enregistrement audio original sécurisé.
5. Transcription française en direct, avec étude et tests réels des solutions natives Apple.
6. Sauvegarde et restauration fiables **avant toute utilisation avec tes vraies données**.
7. Budget strict de 0 €.

## Lots

| Lot | Contenu | Critères de validation (sur **ton iPhone**) |
|---|---|---|
| **0 — Fondations** | Architecture, protection du dépôt, schéma SQLite, CI iOS, écran Diagnostic | ✅ local. **Reste :** voir le lot 0-bis |
| **M — MVP audio** *(code prêt le 2026-11-11, selon la relecture externe)* | Bibliothèque (ajout, fiche, modification, couvertures typographiques), enregistrement vocal AAC (pause, reprise, interruptions, arrière-plan), récupération après plantage, historique, réécoute, vérification d'intégrité. **Sans transcription ni sauvegarde** | ✅ local (58 tests) ; protocole [TEST-PROTOCOL-MVP.md](TEST-PROTOCOL-MVP.md) sur l'iPhone ⏳ |
| **0-bis — Première IPA** | Publication du dépôt, 1er run `ci` + `ios-ipa` (contient le MVP), installation AltServer | L'IPA est construite et inspectée en CI ; l'app s'installe et se lance ; Diagnostic ✓ ; sections A à D du protocole MVP |
| **T — Transcription en direct V1** *(code prêt le 2026-11-11, version 0.3.0)* | SFSpeechRecognizer en parallèle de l'audio ; texte en direct ; correction ; transcription depuis l'audio ; préférences | ✅ local (116 tests) ; ⏳ protocole H sur iPhone |
| **1 — Spike transcription iOS** *(devient : SpeechAnalyzer si H échoue ou déçoit)* | Écran d'essai. Comparaison de `SFSpeechRecognizer` (expo-speech-recognition) et de `SpeechAnalyzer` (module Swift minimal, si iOS 26), en complément de l'audio AAC du MVP. `expo-dev-client` pour itérer | Tableau de mesures : dictée de 10 min, mode avion, appel entrant, verrouillage de 5 min, arrière-plan de 5 min, casque Bluetooth, taille par minute. **Données conservées après mise à jour de l'IPA et après « Refresh » AltStore.** Décisions D8, D9 et D17 tranchées |
| **2 — Bibliothèque** *(code prêt le 2026-11-11 : séries, tomes, couvertures Photos/Fichiers, bibliothèque mixte ; polices embarquées reportées)* | Séries, tomes, couvertures, statuts, page actuelle ; interface sombre et cinématographique, polices embarquées | Ajout, modification et retrait sur l'iPhone ; retrait d'une série sans perte ; défilement fluide avec plus de 200 couvertures fictives |
| **3 — Sessions vocales** | Implémentation définitive : sauvegarde continue, récupération après crash, durée, page, réécoute, correction du texte sans toucher à l'audio | Protocole d'interruptions complet ; audio intact (SHA-256) après correction du texte ; récupération après arrêt forcé de l'app |
| **4 — Sauvegarde & restauration** 🔒 | Archive `.lsbackup` vérifiée, reprise, restauration atomique, partage système | Restauration réussie **après suppression et réinstallation de l'app** ; archive corrompue refusée sans dégât. **Feu vert pour tes vraies données seulement après ce lot** |
| 5 — Catégories & Archives | Catégories multiples ; recherche plein texte et filtres | Requêtes rapides sur un volume fictif important |
| 6 — Exports | DOCX, TXT, JSON par tome (chronologique, texte intégral, métadonnées) ; export de l'audio associé | Fichiers ouverts dans Word et dans un éditeur ; JSON validé |
| 7 — Réglages & finitions | Thème persistant, accent, préférences de transcription, stockage, confidentialité, suppression confirmée | Recette complète |
| 8 — Google Drive (optionnel) | Seulement si l'étude le valide à 0 € | Sauvegarde et restauration réelles |
| V2 | Android | — |

Hors périmètre V1 : réseau social, publication, analyse par IA, génération TikTok, fonctionnalités payantes, Android.
