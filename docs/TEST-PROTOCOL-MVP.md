# Protocole de test du MVP sur iPhone

Quatre niveaux, toujours rapportés **séparément** :

1. **Bundle JS compilé** : vérifié localement sous Windows.
2. **App native compilée** : le workflow `ios-ipa` est vert, avec l'inspection de l'IPA.
3. **IPA installée** : AltServer, identifiant Apple secondaire.
4. **Fonctionnalité testée sur iPhone** : chaque ligne ci-dessous.

Consigner chaque résultat dans [TEST-RESULTS.md](TEST-RESULTS.md) : date, version d'iOS, résultat, message exact en cas d'échec. Utiliser uniquement des **livres fictifs** pendant ces tests.

## A. Installation et démarrage
| # | Test | Attendu |
|---|---|---|
| A1 | Lancer l'app | La bibliothèque vide s'affiche, sans écran rouge |
| A2 | Réglages → Diagnostic technique | SQLite ✓, FTS5 ✓, Stockage privé ✓ |

## B. Bibliothèque
| # | Test | Attendu |
|---|---|---|
| B1 | Ajouter un livre (titre + auteur seulement) | La fiche s'ouvre |
| B2 | Ajouter un livre sans titre | Message « Le titre est obligatoire », rien n'est créé |
| B3 | Modifier la fiche (statut En cours, page 120 / 300) | Modifications visibles dans la fiche et dans la bibliothèque |
| B4 | **Fermer complètement l'app** (balayer), puis la rouvrir | Les livres sont toujours là |

## C. Enregistrement
| # | Test | Attendu |
|---|---|---|
| C1 | Première session : refuser l'accès au micro | Message clair et bouton « Ouvrir les réglages », aucune session fantôme |
| C2 | Autoriser le micro, enregistrer 30 s, terminer | « Session enregistrée » ; la réécoute fonctionne |
| C3 | Enregistrer **10 min** | Durée ≈ 10:00, taille ≈ 5 Mo, réécoute de bout en bout |
| C4 | Pause 20 s, puis reprise | La durée finale exclut la pause ; l'audio contient les deux parties |
| C5 | **Verrouiller l'écran** 2 min pendant l'enregistrement | L'enregistrement continue (le minuteur a avancé de 2 min) ; audio complet |
| C6 | App **en arrière-plan** 2 min (autre app ouverte) | Idem |
| C7 | **Appel entrant** (ou alarme ou Siri) pendant l'enregistrement | L'écran affiche « Interrompu » ; Reprendre fonctionne ; l'audio avant et après l'appel est présent |
| C8 | **Mode avion** pendant tout l'enregistrement | Aucun changement (100 % local) |
| C9 | **Arrêt forcé** de l'app pendant l'enregistrement (balayer l'app), puis relance | La session apparaît « interrompue », son fichier est conservé. **À noter : l'audio est-il lisible ?** (un m4a non finalisé peut être illisible : c'est la mesure clé) |
| C10 | Deux livres, une session chacun | Chaque session apparaît sous le bon livre et dans l'onglet Archives |

## D. Réécoute et intégrité
| # | Test | Attendu |
|---|---|---|
| D1 | Fermer l'app, rouvrir, réécouter une session | Lecture correcte, ±15 s fonctionnent, son audible même en mode silencieux |
| D2 | « Vérifier l'intégrité de l'audio » | ✓ Audio intact |
| D3 | « Exporter l'audio » → Enregistrer dans Fichiers (puis Google Drive si l'app est installée) | Fichier nommé « Lecture sucrée - <Titre> - <date heure>.m4a », lisible depuis Fichiers ; l'original reste lisible dans l'app (D2 toujours ✓) |

## E. Durée de vie (compte Apple gratuit)
| # | Test | Attendu |
|---|---|---|
| E1 | Installer une **nouvelle IPA** (buildNumber +1) par-dessus l'ancienne | **Livres et sessions conservés**, audio relisible |
| E2 | AltStore → **Refresh All** | Données conservées |
| E3 | (Plus tard) Lot Sauvegarde : supprimer l'app, la réinstaller, restaurer | Tout est revenu, audio relisible, pas seulement un checksum identique |

**Tant que E3 n'est pas validé, aucune donnée n'est sauvegardée hors de l'iPhone** : supprimer l'app efface tout.
