# Recherche et importation de livres (0.4.0, build 6)

> État au 2026-11-12. **Compilé et vérifié localement, y compris contre les vrais catalogues. Rien n'est testé sur iPhone.**
> Les recherches réelles ont porté sur trois séries de light novels choisies par l'utilisateur. Leurs titres et les résultats détaillés restent **hors du dépôt**, dans `private/book-search-live.txt`, ignoré par Git. Ce document ne décrit que les constats.

## 1. Ce que fait la fonction

- Dans la Bibliothèque, le bouton **＋** ouvre **Rechercher un livre**. La recherche accepte un titre, un auteur ou un ISBN.
- **Parcours A** : on touche une édition. L'app relit l'édition exacte et télécharge sa couverture. Elle affiche ensuite la fiche : langue, éditeur, format, tome, source et avertissements. On peut tout modifier, puis appuyer sur **Ajouter**.
- **Parcours B** : on active « Ajouter plusieurs tomes » et on coche des tomes. L'écran de vérification :
  - classe les tomes dans l'ordre des numéros ;
  - décoche d'office les doublons ;
  - signale les langues ou éditeurs mélangés et les tomes sans numéro ;
  - propose un auteur commun et le choix de la série (nouvelle, existante ou aucune).
  Rien n'est ajouté sans confirmation, et l'ajout se fait en une seule transaction.
- La saisie manuelle reste disponible (« Saisir un livre à la main »), et elle fonctionne hors ligne.

## 2. Sources : vérifiées le 2026-11-12

| Source | Clé | Coût | Conditions retenues | Utilisée |
|---|---|---|---|---|
| **BnF**, catalogue général, API SRU | Non | Gratuit | Licence Ouverte Etalab 2.0, avec **mention obligatoire de la source** (« Bibliothèque nationale de France »). Aucune limite de débit documentée | ✅ Éditions françaises, format UNIMARC |
| **Open Library** (`search.json`, `/works/…/editions.json`, couvertures) | Non | Gratuit | 1 requête/s sans identification. Couvertures par identifiant non limitées ; par ISBN, 100 par 5 min et par IP. « Pas de téléchargement massif » | ✅ Éditions anglaises et couvertures |
| **Google Books API** | **Oui, obligatoire** (sans clé : HTTP 429, quota de 0, constaté) | Non vérifié | Clé **interdite dans un projet open source**, copie permanente du contenu interdite au-delà de l'en-tête de cache, « powered by Google » et lien vers Google Books obligatoires sur chaque résultat | ❌ Écartée (D47) |
| **AniList** (titres alternatifs, format) | Non | Gratuit | Interdit aux services « de même nature », dont les « list or tracker services » | ❌ Écartée (D48) |
| **BnF**, service de couvertures | ? | ? | Documentation injoignable (api.bnf.fr, DNS en échec) ; l'URL essayée renvoie une erreur 500 | ⏳ Piste à revoir |

Identification envoyée aux catalogues : `LectureSucree/0.4 (application de lecture personnelle, iOS)`. **Aucune adresse e-mail** n'est envoyée, contrairement à ce qu'Open Library suggère. Le seul contenu transmis est le **texte de la recherche**.

## 3. Fonctionnement

1. **Requêtes en parallèle**, avec un délai maximal par source (BnF 20 s, Open Library 15 s). En cas d'échec réseau passager, une seule nouvelle tentative a lieu. Une source en panne n'empêche pas d'afficher l'autre : l'état de chaque source est affiché.
2. **BnF** : la requête porte sur le titre ou l'auteur, et seulement sur les imprimés (`bib.doctype any "a"`). On lit au plus 100 notices UNIMARC, qui donnent :
   - la série et le numéro (461$v, 225$v, 200$h) ;
   - la pagination (215) ;
   - l'ISBN (010) ;
   - l'éditeur (210/214) ;
   - la langue et la langue d'origine (101) ;
   - la forme « Romans » (608) ;
   - les autres titres (510/517).
   Les notices d'ensemble, sans ISBN ni pagination, sont écartées.
3. **Open Library** : on lit au plus 60 œuvres, chacune avec l'édition qui correspond le mieux (`lang=fr`). La médiane des pages de l'œuvre n'est prise que si l'œuvre n'a **qu'une seule** édition.
4. **Pertinence** : tous les mots cherchés doivent figurer dans le titre, la série, les autres titres ou l'auteur.
5. **Fusion par ISBN uniquement.** Une même édition décrite par les deux catalogues est fusionnée : la couverture d'Open Library peut alors compléter la notice BnF. Deux éditions différentes ne sont **jamais** mélangées.
6. **Ordre** : français, puis anglais, puis autres langues. Les light novels passent avant les formats « non précisés ». Les mangas et autres formats sont **masqués par défaut** : un bouton les affiche, avec leur nombre.
7. **Avant l'ajout**, l'édition exacte est relue :
   - **Open Library** : on choisit l'édition imprimée de la même langue (par son ISBN si possible). Pages, ISBN, éditeur, couverture et série viennent alors **tous** de cette édition.
   - **BnF** : on cherche la couverture du même ISBN sur Open Library, et son existence est vérifiée (requête HEAD).
8. **Couverture** : elle est téléchargée en HTTPS (le code natif refuse toute réponse hors 2xx). Les fichiers de moins de 2 Ko sont refusés. L'image est normalisée comme une photo : JPEG de 900 px au plus. Elle n'est copiée dans le stockage privé qu'au moment de l'ajout.

### Format (light novel, manga, autre)

- **Indices forts** : « light novel » ou « manga » explicite, « dessin » ou « comic » dans les mentions de responsabilité, forme BnF « Romans ».
- **Indices faibles** : éditeur connu pour un format, « non paginé », roman illustré traduit du japonais.
- Si des indices forts se contredisent, le format reste « **non précisé** » plutôt que deviné.
- **Les sujets d'Open Library ne servent pas à repérer les mangas** : des light novels y sont étiquetés « Comics & graphic novels, manga » (constaté).

### Numéros de tome

- Un champ structuré du catalogue est prioritaire. Sinon, le numéro est cherché derrière « Vol. », « Tome », « Ep. » ou « Volume deux ».
- Un nombre isolé en fin de titre est accepté, mais marqué « (?) » : *numéro déduit du titre, à vérifier*.
- Le nombre qui fait partie du nom de la série n'est jamais pris pour un tome.
- Les tomes décimaux (14.5), les hors-séries et spin-offs (« Alter 1 ») et les intégrales ou coffrets (« Vol. 1-12 ») sont reconnus.
- **Aucune conversion** entre numérotations japonaise, anglaise et française : un numéro vaut pour l'édition (langue + éditeur) qui le porte. L'écran d'ajout groupé le rappelle.

### Doublons

- Même ISBN → doublon certain.
- Sinon, même titre normalisé **et** même numéro → doublon probable.
- Dans une sélection : même ISBN, ou même série + même numéro + même langue.

Un doublon est décoché, signalé, et revérifié au moment de l'ajout.

## 4. Limites constatées (recherches réelles du 2026-11-12)

1. **Couvertures des éditions françaises : presque toujours absentes.** La BnF n'en fournit pas par API, et Open Library n'en a aucune pour les ISBN français testés (404). Les éditions anglaises en ont souvent. **Parade** : choisir l'image dans Photos depuis la fiche, comme aujourd'hui.
2. **Une des trois séries de test n'a aucune notice à la BnF** : seule l'édition anglaise est trouvée.
3. **Open Library, éditions anglaises** :
   - la langue manque souvent sur l'édition ;
   - certains titres n'ont pas de numéro (« Titre » seul) ;
   - la même série apparaît sous plusieurs éditeurs ou marques ;
   - l'édition proposée par la recherche est parfois un ebook (corrigé avant l'ajout par le choix de l'édition imprimée) ;
   - un même nombre de pages, 280, apparaît pour de nombreux tomes : il est signalé comme « peut-être approximatif ».
4. **Auteurs en écriture japonaise sur Open Library.** Les variantes latines mélangent auteurs, illustrateurs et traducteurs : une autre personne y figurait en premier. Aucune variante n'est donc choisie automatiquement. L'écran d'ajout groupé propose un auteur commun, modifiable.
5. **BnF** :
   - au plus 100 notices par recherche (l'écran le signale) ;
   - quelques notices récentes n'ont ni éditeur ni pagination ;
   - le titre de certaines notices de manga est le nom de la série.
6. **Les catalogues ne sont pas complets.** L'app n'affirme jamais qu'une série est complète et ne crée aucun tome manquant.
7. **Faux positifs résiduels** (un livre sans rapport qui contient les mêmes mots) : classés « format non précisé », en bas de liste.
8. **Titres alternatifs** : seulement ceux que fournissent les catalogues (titre original de l'œuvre sur Open Library, variantes 510/517 à la BnF). Une recherche par titre japonais n'est fiable que sur Open Library.

## 5. Données et confidentialité

- Migration **v2** : ajout de 4 colonnes facultatives (`isbn`, `publisher`, `language`, `source_ref`) et d'un index. **Aucune ligne existante n'est réécrite.** Un test vérifie qu'une base v1 avec séries, tomes, sessions, audio et transcriptions est intacte après la migration.
- L'ajout ne fait que des **INSERT** ; les livres, séries, audios et transcriptions existants ne sont pas touchés (testé).
- Transaction unique pour un ajout groupé. Si elle échoue, les couvertures déjà copiées sont supprimées (testé, mutation détectée).
- Les résultats de recherche restent **en mémoire** jusqu'à la confirmation.

## 6. Essai réel depuis le PC

```powershell
$env:BOOK_SEARCH_LIVE = "titre 1|titre 2"; $env:BOOK_SEARCH_LIVE_ENRICH = "3"; npx.cmd jest live
# résultat : private/book-search-live.txt (ignoré par Git)
```

Sous Jest, `fetch` est remplacé par une imitation (préréglage `jest-expo`) : l'essai passe donc par `node:https`. Sur ce PC, la BnF n'est joignable que depuis PowerShell, pas depuis le shell Bash bac à sable.
