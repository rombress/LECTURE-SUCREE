# Protocole de test du MVP sur iPhone

Quatre niveaux, toujours rapportés **séparément** :

1. **Bundle JS compilé** : vérifié localement sous Windows.
2. **App native compilée** : le workflow `ios-ipa` est vert, avec l'inspection de l'IPA.
3. **IPA installée** : AltServer, identifiant Apple secondaire.
4. **Fonctionnalité testée sur iPhone** : chaque ligne ci-dessous.

Consigner chaque résultat dans [TEST-RESULTS.md](TEST-RESULTS.md) : date, version d'iOS, résultat, message exact en cas d'échec. Utiliser uniquement des **livres fictifs** pendant ces tests.

## J. Recherche et importation de livres (0.4.0, build 6) — À FAIRE EN PREMIER

**Avant de commencer** :
- Installer la 0.4.0 **par-dessus** la 0.3.1, sans désinstaller.
- La sauvegarde (lot 4) n'existe pas encore. Les livres ajoutés pendant ce test peuvent être supprimés ensuite.

Utiliser tes trois séries de test. Pour chaque test, noter **OK / KO** et le message affiché.

| # | Test | Résultat attendu |
|---|---|---|
| J1 | Lancer l'app, ouvrir la Bibliothèque puis Réglages → Diagnostic | Livres, séries, couvertures, sessions, audios et transcriptions **tous présents**. Diagnostic : « schéma v2/2 » |
| J2 | ＋ → **Rechercher un livre** → la série n° 1, titre français | Éditions **françaises en tête**, light novels, numéros dans l'ordre. État des sources affiché (« BnF : N retenus · Open Library : N retenus »). Mangas masqués, avec leur nombre |
| J3 | Toucher le chip de format (« Tous les formats ») | Les mangas et autres formats (coloriages…) apparaissent, marqués « Manga » ou « Autre format » |
| J4 | Toucher une édition **française** | Fiche « Édition trouvée » : langue, éditeur, tome, source. Pages et ISBN remplis. Couverture probablement **absente**, avec un message (limite connue) |
| J5 | Modifier un champ, puis **Ajouter** | Le livre s'ouvre avec les infos modifiées. Choisir une couverture dans Photos fonctionne toujours |
| J6 | Rechercher la série n° 3 (aucune édition française dans les catalogues) | Éditions **anglaises** proposées, avec couvertures pour la plupart. Tome 14.5 et tomes sans numéro signalés |
| J7 | « Ajouter plusieurs tomes » → cocher 4 tomes **dont un déjà ajouté** en J5 → Vérifier | Le doublon est **décoché** et marqué « Déjà dans la bibliothèque ». Ordre des numéros. Avertissement si langues ou éditeurs sont mélangés |
| J8 | Choisir « Nouvelle série », corriger l'auteur si besoin, **Ajouter** | Progression « Lecture des détails… », puis bilan : N tomes ajoutés, doublon non ajouté, couvertures manquantes comptées. « Voir la série » : tomes dans l'ordre, couvertures présentes quand elles existent |
| J9 | Série n° 2 en anglais : vérifier l'auteur proposé | S'il est en japonais, l'avertissement le dit et le champ « Auteur » permet de le corriger pour tous les tomes |
| J10 | Rechercher un **ISBN** (celui d'un livre ajouté) | Un seul résultat : cette édition |
| J11 | **Mode avion** → rechercher | « Pas de connexion », bouton « Ajouter à la main ». La bibliothèque reste consultable et l'ajout manuel fonctionne |
| J12 | Recherche absurde (« zzqxw ») | « Aucun résultat » et proposition d'ajout manuel |
| J13 | Fermer complètement l'app puis la rouvrir | Les livres importés et leurs couvertures sont toujours là, aussi en mode avion |
| J14 | Enregistrer une session de 30 s sur un livre importé (transcription en direct) | Audio et transcription comme en 0.3.1 (contrôle de non-régression) |

**À me rapporter** : chaque KO avec le message exact, et pour J2, J6 et J9 une capture d'écran (aucune donnée personnelle dessus).

## I. Protocole court de la transcription (0.3.1, build 5) — validé le 2026-11-12

Avec un **livre de test**, l'iPhone **réglé en français**, la transcription en direct activée (Réglages). Noter pour chaque test : OK / KO, et le message affiché.

| # | Test | Résultat attendu |
|---|---|---|
| I1 | Enregistrer **30 s** en lisant un texte à voix haute | Le texte apparaît pendant la lecture ; aucun message d'erreur ; arrêt normal |
| I2 | Ouvrir la session : **réécouter tout l'audio**, « Vérifier l'intégrité », relire le texte | Audio **complet et propre** (pas de coupure, pas de son étouffé ou haché) ; intégrité OK ; texte fidèle, **sans phrase en double** |
| I3 | Enregistrer **3 min** avec plusieurs pauses silencieuses de 10 à 30 s | Audio complet ; le texte reprend après chaque pause ; rien de doublé ; noter si « Transcription : reprise… » s'affiche souvent |
| I4 | Pendant un enregistrement, **verrouiller l'écran** 1 min en continuant de parler, puis déverrouiller | **L'audio doit être complet** (c'est la seule garantie). Le texte de la période verrouillée peut manquer : c'est attendu et ce n'est pas garanti. La session doit alors être marquée « partielle » |
| I5 | **Mode avion**, puis enregistrer 30 s | Audio complet ; texte en direct présent (reconnaissance sur l'iPhone) |
| I6 | Sur une session existante (par exemple I4) : « Retranscrire depuis l'audio » | Texte complet de tout l'audio, y compris le passage verrouillé ; l'audio est inchangé (intégrité OK) |

**Règle de repli** : si I1, I2 ou I3 montrent un **audio dégradé** (coupure, son haché ou étouffé, durée fausse), désactiver la transcription en direct dans Réglages. L'app fonctionne alors en **enregistrement seul, suivi d'une transcription différée** (« Transcrire l'audio » sur la session). Me signaler le test et le symptôme.

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

## H. Transcription française en direct (version 0.3.0, build 4)

**Rien de cette section n'a encore été testé sur iPhone.** Utiliser des **livres de test**. Installer par-dessus la version actuelle (H0 = non-régression des données).
Ordre conseillé : H1 à H3 d'abord. Ce sont les tests qui disent si l'audio et la transcription cohabitent.

| # | Test | Attendu | Si échec |
|---|---|---|---|
| H0 | Après la mise à jour, ouvrir l'app | Livres, séries, couvertures et sessions intacts | Arrêter, ne rien supprimer, me prévenir |
| H1 | **Réglages → Diagnostic technique** | Relever : « Reconnaissance vocale native » (disponible ? **sur l'appareil ?**) et « Langue fr-FR » (prise en charge ? installée hors ligne ?) | Me transmettre la capture |
| H2 | Nouvelle session, Transcription en direct **activée**, parler 30 s, Terminer | 1re fois : iOS demande l'autorisation de reconnaissance vocale. Le texte apparaît **pendant** la dictée ; message « ● Transcription en direct, sur l'iPhone » | Noter le message affiché sous la zone de texte |
| H3 | Réécouter la session de H2 + « Vérifier l'intégrité » | **Audio complet et audible** (aussi bon qu'en 0.2.x), ✓ intact. **C'est le test le plus important** : la transcription ne doit pas dégrader l'audio | Si l'audio est silencieux ou coupé : désactiver la transcription (interrupteur) et me prévenir |
| H4 | Écran de session après H2 | Le texte de la dictée est affiché | |
| H5 | « Modifier le texte » → corriger un mot → Enregistrer, puis réécouter et vérifier l'intégrité | Correction conservée ; audio inchangé (✓ intact) | |
| H6 | Dictée de **5 min** avec des pauses de 5 à 10 s | Le texte continue après chaque pause (pas d'arrêt définitif ni de doublons de phrases) | Noter à quel moment le texte s'arrête |
| H7 | **Mode avion**, nouvelle session de 1 min | Le texte apparaît quand même (vrai hors-ligne) | Si « français hors ligne indisponible » : relever le message ; l'audio doit être enregistré |
| H8 | **Écran verrouillé** 1 min pendant la dictée | L'audio est complet (H3). Le texte dicté écran verrouillé est présent **ou** manquant : noter lequel | Le texte manquant peut être récupéré avec « Retranscrire depuis l'audio » |
| H9 | **Appel ou alarme** pendant la dictée, puis Reprendre | L'audio reprend ; le texte reprend après « Reprendre » | |
| H10 | Pause 20 s, puis Reprendre | Le texte continue ; pas de doublon | |
| H11 | Session avec l'interrupteur **désactivé** | Comme en 0.2.x : audio seul, pas de demande de reconnaissance | |
| H12 | Sur la session de H11 : « Transcrire l'audio » | Le texte de l'enregistrement apparaît après quelques secondes | Noter le message d'erreur |
| H13 | **Arrêt forcé** de l'app pendant une dictée transcrite, puis relance | Session « interrompue », audio conservé, **texte partiel conservé** | |
| H14 | Recherche dans Archives | (Recherche non encore disponible dans l'interface : test reporté) | — |
| H15 | Refuser la reconnaissance vocale (Réglages iOS › Lecture sucrée), puis nouvelle session | Message « Reconnaissance vocale refusée… L'audio est enregistré normalement. » ; l'audio est bien enregistré | |

**Tant que E3 n'est pas validé, aucune donnée n'est sauvegardée hors de l'iPhone** : supprimer l'app efface tout.
