# Coûts et limites des offres gratuites

Budget : **0 €**. Toute ligne ci-dessous qui pourrait devenir payante est signalée **avant** d'être utilisée.

| Service | Usage | Gratuit ? | Limite / risque de dépassement | Garde-fou |
|---|---|---|---|---|
| GitHub (dépôt public) | Code source | Oui | — | — |
| GitHub Actions, runners standard (ubuntu, macos-26) | CI, APK, IPA | Oui **en dépôt public** | **En dépôt privé**, les minutes macOS sont décomptées du quota puis facturées (0,062 $/min selon la doc GitHub consultée pour le prototype le 2026-11-11). Les runners « larger » (`-large`, `-xlarge`) sont payants même en public | Rester public ; n'utiliser que `ubuntu-latest` et `macos-26` ; régler une **limite de dépense à 0 $** dans Settings → Billing |
| Artefacts GitHub Actions | APK / IPA | Oui (public) | Conservation fixée à 14 jours | `retention-days: 14` |
| Expo / React Native / modules npm | Code | Oui (licences libres) | **EAS Build/Submit non utilisés** (offre gratuite limitée, et le build iOS installable y exige un compte Apple payant) | Builds faits sur GitHub Actions |
| Compte Apple gratuit + AltStore/AltServer | Signature iOS | Oui | 7 jours, 3 apps, 10 App IDs/semaine ; **risque de verrouillage du compte** (déjà observé) | Identifiant Apple secondaire, une tentative à la fois |
| Reconnaissance vocale Apple / Google | Transcription | Oui | Mode réseau : limites de débit (non chiffrées) et envoi d'audio | Mode « sur l'appareil » en priorité |
| Modèles Whisper (si retenus) | Transcription hors ligne | Oui (MIT) | Téléchargement de 75 à 466 Mo, une fois | Wi-Fi, avec confirmation |
| Google Cloud (projet OAuth) | Drive (optionnel) | Oui, sans compte de facturation | Jetons de 7 jours en mode « Testing » ; vérification Google possible selon le scope | Étude à finir avant tout usage |
| Google Drive | Archives de sauvegarde | 15 Go partagés | Espace partagé avec Gmail et Photos ; l'audio est volumineux | Ne garder que les N dernières sauvegardes |
| Catalogue BnF (API SRU) | Recherche de livres | Oui, sans clé (Licence Ouverte, citation de la source) | Aucune limite documentée ; 1 à 2 requêtes par recherche | Délai max 20 s, une seule nouvelle tentative |
| BnF, service Couvertures (bêta) | Couvertures des éditions françaises | Oui, sans clé (Licence Ouverte ; provenance et date mentionnées) | Aucune limite documentée ; 1 requête de test (≈ 5 Ko) + 1 téléchargement par livre ajouté ; URL bêta susceptible de changer | Une seule tentative, repli sur Open Library |
| Open Library | Recherche, couvertures | Oui, sans clé | 1 requête/s ; couvertures par ISBN : 100 / 5 min / IP | 1,1 s entre deux lectures d'édition ; couvertures par identifiant |
| Google Books API | — | Clé obligatoire | Conditions incompatibles avec un dépôt public | **Non utilisée** (D47) |
| JDK Temurin, SDK Android | Compilation locale (optionnelle) | Oui | Plusieurs Go de disque | Facultatif |

**Aucun abonnement, aucune API payante et aucun serveur ne sont nécessaires** à la V1.
