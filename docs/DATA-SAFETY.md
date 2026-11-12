# Données : ce qui est protégé, ce qui ne l'est pas (MVP)

> À lire **avant** d'utiliser le MVP avec de vrais livres. État au 2026-11-11, version 0.1.0 (build 1).

## Où vivent les données

Uniquement **sur ton iPhone**, dans l'espace privé de l'app : la base SQLite (livres, sessions) et les fichiers audio `.m4a`. Rien n'est envoyé ailleurs, sauf quand tu exportes toi-même un audio par le menu Partager.

## Ce qui est protégé

| Situation | Protection |
|---|---|
| Arrêt normal d'une session | Audio finalisé, déplacé, empreinte SHA-256 enregistrée ; la base refuse ensuite de remplacer cet audio (testé) |
| Appel, Siri, alarme pendant l'enregistrement | Le recorder se met en pause (code d'expo-audio vérifié) ; tu reprends ensuite. *À confirmer sur l'iPhone (C7)* |
| Écran verrouillé, app en arrière-plan | Enregistrement autorisé à continuer (mode audio d'arrière-plan). *À confirmer (C5, C6)* |
| App tuée ou plantage pendant l'enregistrement | Session et fichier conservés et récupérés au lancement suivant (testé localement). **Lisibilité du fichier non garantie** : un m4a non finalisé peut être illisible. *Mesure clé : C9* |
| Fausse manœuvre (0.2.1) | Toute suppression passe par une confirmation iOS (bouton rouge) ; un livre avec sessions demande **deux** confirmations et affiche ce qui sera perdu. Supprimer une série ne supprime jamais ses tomes ni leurs sessions |
| Transcription (0.3.0) | Indépendante de l'audio : ses erreurs ne remontent pas à l'enregistrement (code isolé). Chaque énoncé validé est sauvegardé immédiatement, un brouillon toutes les 5 s, et le texte partiel est récupéré après un plantage. Corriger le texte ne touche jamais l'audio. **Cohabitation réelle avec l'enregistrement non vérifiée sur iPhone (H3)** |
| Confidentialité de la voix | Reconnaissance **sur l'iPhone** par défaut : l'audio n'est envoyé nulle part. La reconnaissance en ligne (serveurs d'Apple) n'a lieu que si tu l'autorises dans Réglages |
| Suppression interrompue (plantage, panne) | Corbeille interne : l'audio n'est effacé qu'après la suppression en base ; en cas d'échec, il est remis en place ; réparation automatique au lancement (testé avec pannes simulées) |
| Expiration de la signature (7 jours) | L'app ne se lance plus, mais **les données restent** sur l'iPhone. Elles redeviennent accessibles après un Refresh ou une réinstallation du même bundle ID (comportement documenté par la communauté, *à confirmer : E2*) |
| Installation d'une nouvelle version de l'IPA | Données conservées si le bundle ID est le même (*à confirmer : E1*) |
| Séries (0.2.0) | Retirer une série ne supprime aucun tome, aucune session, aucun audio (testé) ; déplacer un tome ne touche jamais ses sessions (testé) |
| Couvertures (0.2.0) | Copies privées dans l'app ; les images d'origine (Photos, Fichiers) ne sont jamais modifiées. Non incluses dans l'export audio |
| Recherche de livres (0.4.0) | Seul le **texte de la recherche** est envoyé à la BnF et à Open Library, sans adresse e-mail ni identifiant. L'ajout ne fait que créer des livres (aucune donnée existante modifiée, testé). Migration v2 : colonnes ajoutées, aucune ligne réécrite (testé) |
| Copie d'un audio vers Fichiers ou Drive | **Oui, manuellement** : bouton « Exporter l'audio » dans chaque session. Copie vérifiée par SHA-256 avant partage ; l'original n'est jamais touché |
| Sauvegarde iCloud **de l'iPhone** | Si elle est activée dans les réglages iOS, elle inclut normalement les données des apps, donc celles-ci (non vérifié pour une app installée via AltStore) |

## Ce qui N'EST PAS protégé

| Risque | Conséquence | Parade disponible aujourd'hui |
|---|---|---|
| **Suppression volontaire** d'une session ou d'un livre (0.2.1) | **Définitive** : pas de corbeille visible ni d'annulation après confirmation | Exporter l'audio avant ; lire les confirmations |
| **Suppression de l'app** (par toi, par iOS « Décharger les apps inutilisées », ou lors d'une réinstallation forcée) | **Tout est perdu** : livres, sessions, audio | Exporter régulièrement les audios importants ; désactiver *Réglages › App Store › Décharger les apps inutilisées* |
| Perte, vol ou casse de l'iPhone | Tout est perdu, sauf ce qui a été exporté ou inclus dans la sauvegarde iCloud de l'iPhone | Idem |
| La base SQLite (livres, dates, pages, liens audio ↔ livre) | **Aucun export** dans le MVP. Un audio exporté garde le titre et la date dans son **nom**, mais pas le reste | Lot Sauvegarde (archive complète + restauration testée) |
| Changement du bundle ID par AltStore ou par une configuration différente | L'app serait vue comme une nouvelle app, avec des données vides (les anciennes restent inaccessibles) | Ne jamais modifier `com.lecturesucree.app` |
| Bug inconnu sur l'appareil | Le MVP n'a encore **jamais tourné sur un iPhone** | Commencer par des livres fictifs (protocole A à E) |

## Recommandation

1. Dérouler d'abord le protocole [TEST-PROTOCOL-MVP.md](TEST-PROTOCOL-MVP.md) (sections A à E) avec des **livres fictifs**.
2. Si tout passe, l'usage réel est possible en acceptant le risque ci-dessus, et en **exportant les audios importants** après chaque session.
3. Le lot Sauvegarde (archive complète base + audio, restauration vérifiée après réinstallation) supprime l'essentiel de ces risques.
