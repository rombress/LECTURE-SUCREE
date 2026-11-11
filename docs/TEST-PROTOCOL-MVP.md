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

## F. Bibliothèque : séries et couvertures (version 0.2.0, build 2)

**Avant d'installer** : exporte les audios importants (D3), par précaution. L'IPA 0.2.0 s'installe **par-dessus** la 0.1.0 (même bundle ID) : c'est aussi le test **E1**.

| # | Test | Attendu |
|---|---|---|
| F0 | Après la mise à jour, ouvrir l'app | **Tous les livres et sessions de la 0.1.0 sont présents**, les audios se réécoutent (E1) |
| F1 | ＋ → Nouvelle série (titre + couverture depuis **Photos**) | La série s'ouvre ; la couverture s'affiche en entier, cadrée en 2:3 |
| F2 | Dans la série : « Ajouter un tome » (libellé « 2 »), puis un autre (« 1 »), puis un « Hors-série » | Ordre affiché : 1, 2, Hors-série |
| F3 | Rattacher un livre **existant** (avec des sessions) à la série : fiche → Modifier → Série | Le livre apparaît dans la série ; **ses sessions sont toutes là** et se réécoutent |
| F4 | Le rendre indépendant (Série → « Livre indépendant ») | Il revient dans la bibliothèque, sessions intactes |
| F5 | Couverture d'un tome depuis **Fichiers** (photo HEIC ou PNG) | Couverture visible dans la bibliothèque, la série et la fiche |
| F6 | Remplacer une couverture, puis « Sans image » | Nouvelle image, puis retour à la couverture typographique |
| F7 | **Retirer la série** (confirmer) | Ses tomes redeviennent indépendants, **avec toutes leurs sessions** ; aucun audio perdu |
| F8 | Fermer complètement l'app, rouvrir | Séries, tomes et couvertures persistent |
| F9 | Enregistrer une session dans un tome d'une série | Fonctionne comme avant (non-régression audio) |
| C3 | (en attente) Enregistrement de 10 min | Durée ≈ 10:00, réécoute complète |

## G. Suppressions (version 0.2.1, build 3)

Utiliser **uniquement des livres et sessions de test**. Installer par-dessus la 0.2.0 (G0 = non-régression des données).

| # | Test | Attendu |
|---|---|---|
| G0 | Après la mise à jour, ouvrir l'app | Livres, séries, couvertures et sessions de la 0.2.0 présents |
| G1 | Fiche d'un livre → **appui long** sur une session → « Supprimer la session… » → Annuler | Rien ne change |
| G2 | Idem → Supprimer | La session disparaît ; les **autres sessions** du livre restent et se réécoutent |
| G3 | Ouvrir une session → « Supprimer cette session » → Supprimer | Retour à la fiche ; la session n'est plus listée (fiche ni Archives) |
| G4 | « Supprimer ce livre » sur un livre **sans** session | Une seule confirmation ; le livre disparaît |
| G5 | « Supprimer ce livre » sur un livre **avec** sessions | 1re confirmation : nombre de sessions et d'audios, durée totale ; **2e confirmation** ; puis le livre et ses sessions disparaissent (Archives comprises) |
| G6 | Après G5 | Les **autres livres**, tomes d'une même série et la série sont intacts |
| G7 | Fiche d'une série → « Supprimer la série » | Le message explique que les tomes restent ; après confirmation, ils sont indépendants avec toutes leurs sessions |
| G8 | Fermer complètement l'app, rouvrir | Les suppressions persistent ; rien d'inattendu ne réapparaît |
| G9 | Non-régression : enregistrer, réécouter, exporter une session ; changer une couverture | Fonctionne comme en 0.2.0 |

**Tant que E3 n'est pas validé, aucune donnée n'est sauvegardée hors de l'iPhone** : supprimer l'app efface tout.
