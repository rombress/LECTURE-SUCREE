# Relecture externe : recherche et importation de livres (2026-11-12)

> Message autonome à transmettre à ChatGPT. Sa réponse sera confrontée au code, aux tests et à la documentation ; elle ne sera pas adoptée d'office.

---

Bonjour. Je te demande une relecture critique d'une décision d'architecture pour une app iPhone personnelle.

## Contexte

- « Lecture sucrée » est une app de suivi de lecture, à usage strictement personnel, et pour l'instant **uniquement sur iPhone**.
- Pile : React Native 0.88 + Expo SDK 58, TypeScript strict, SQLite (expo-sqlite).
- Installation par AltServer, avec un compte Apple gratuit. Budget : 0 €.
- Le **dépôt GitHub est public** : aucune clé, aucun secret, aucune donnée personnelle.
- Pas de serveur. Jusqu'ici, l'app ne faisait aucune requête réseau (sauf la reconnaissance vocale Apple en ligne, désactivée par défaut).

## Besoin

L'utilisateur veut retrouver un livre en tapant un titre, un auteur ou un ISBN, et l'ajouter avec ses informations et sa couverture. Il lit surtout des light novels.

Les exigences sont :
- éditions françaises d'abord, puis anglaises ;
- light novels distingués des mangas ;
- tomes décimaux, hors-séries et intégrales reconnus ;
- aucune confusion entre les numérotations ;
- aucune donnée inventée ;
- pages, ISBN et couverture de la **même** édition.

Il faut deux parcours : ajouter un livre, et ajouter plusieurs tomes en une fois.

## Ce qui a été vérifié (2026-11-12)

1. **Google Books API**, sans clé :
   - Essai réel : HTTP 429 `RESOURCE_EXHAUSTED`, `quota_limit_value: "0"`.
   - La documentation exige une clé ou un jeton.
   - Les Google APIs Terms disent : « Developer credentials may not be embedded in open source projects » et interdisent de « create permanent copies [...] longer than permitted by the cache header ».
   - L'attribution « powered by Google » et un lien vers Google Books sont obligatoires sur chaque résultat.
   - → Écarté.
2. **AniList** : ses conditions interdisent l'usage « within competing, non-complementary services of the same nature [...] anime and manga list or tracker services ». → Écarté.
3. **BnF**, catalogue général, API SRU :
   - Sans clé, sous Licence Ouverte Etalab 2.0, avec citation obligatoire de la source.
   - Les notices UNIMARC donnent la série et le numéro (461$v, 225$v, 200$h), la pagination, l'ISBN, l'éditeur, la langue et la langue d'origine, et la forme « Romans ».
   - Pas de couverture par l'API utilisée. Un « service Couvertures » est annoncé, mais sa documentation était injoignable.
4. **Open Library** : sans clé, 1 requête/s. Couvertures par identifiant non limitées ; par ISBN, 100 par 5 min et par IP.
5. **Essais réels sur 3 séries de light novels** :
   - **Série 1** : la BnF trouve les tomes français du light novel (éditeur LN, numéros structurés) et ceux du manga (éditeur manga, « non paginé »), bien séparés. Open Library trouve les éditions anglaises, avec beaucoup de bruit.
   - **Série 2** : la BnF trouve quelques tomes français. Open Library trouve les tomes anglais 1 à 13 avec couvertures, des hors-séries et des coffrets.
   - **Série 3** : **aucune notice BnF**. Open Library trouve les tomes anglais, dont un tome 14.5.
   - **Couvertures des éditions françaises : aucune trouvée** (Open Library renvoie 404 pour ces ISBN).
   - **Pièges relevés dans les données d'Open Library** :
     - des light novels étiquetés « Comics & graphic novels, manga » dans les sujets ;
     - des variantes latines du nom de l'auteur qui mélangent les personnes ;
     - une langue souvent absente sur l'édition ;
     - un ebook proposé à la place de l'édition imprimée ;
     - 280 pages identiques sur de nombreux tomes.

## Implémentation actuelle (version 0.4.0, vérifiée localement)

- **Requêtes directes depuis l'iPhone** vers la BnF et Open Library, en parallèle :
  - délai maximal, une seule nouvelle tentative en cas d'échec réseau ;
  - une source en panne n'empêche pas d'afficher l'autre ;
  - User-Agent `LectureSucree/0.4 (...)`, **sans e-mail**.
- **Fusion uniquement par ISBN identique.** Avant l'ajout, l'édition imprimée exacte est relue sur Open Library, et pages, ISBN et couverture viennent tous d'elle. Pour une notice BnF, la couverture du même ISBN est cherchée sur Open Library, avec une vérification par requête HEAD.
- **Format** : indices forts explicites, sinon « non précisé ». Les sujets d'Open Library sont ignorés pour les mangas. Mangas et autres formats sont masqués par défaut.
- **Numéro de tome** : champ structuré du catalogue prioritaire. Sinon, un marqueur explicite dans le titre. Un nombre isolé est accepté mais marqué « à vérifier ». Aucune conversion entre numérotations.
- **Doublons** : ISBN, sinon titre normalisé + numéro. Ils sont décochés d'office et revérifiés à l'ajout.
- **Base** : migration v2 par `ALTER TABLE volumes ADD COLUMN` (isbn avec CHECK de longueur 13, publisher, language, source_ref) et un index partiel sur l'isbn.
- **Ajout groupé** :
  - couvertures téléchargées avant la transaction, puis une transaction unique ;
  - en cas d'échec, les fichiers copiés sont supprimés ;
  - uniquement des INSERT.
- **Tests** : 80 tests Jest et 1 test Node, sur données fictives et SQLite réel. 4 mutations réintroduites ont toutes été détectées.

## Options envisagées pour les couvertures françaises

- **A.** Rester ainsi : couverture française absente, choisie à la main dans Photos.
- **B.** Clé Google Books saisie par l'utilisateur dans Réglages, stockée seulement sur l'iPhone. Mais les conditions de cache et d'attribution semblent interdire de stocker la vignette durablement.
- **C.** Service Couvertures de la BnF, à étudier quand sa documentation sera joignable.
- **D.** Sites marchands : exclu, ce serait du scraping.

**Recommandation** : A maintenant, C à étudier. B est refusée pour cause de conditions d'utilisation.

## Questions précises

1. Écarter Google Books à cause des clés et du stockage permanent des vignettes te paraît-il justifié ? Ou existe-t-il une lecture des conditions qui autorise une clé **saisie par l'utilisateur** dans une app personnelle non distribuée, sans stockage permanent de la couverture ?
2. Stocker localement, de façon permanente, une couverture d'Open Library (pour un usage personnel, hors ligne) pose-t-il un problème que nous aurions manqué ?
3. Connais-tu un service gratuit et sans clé, aux conditions compatibles, qui fournisse les **couvertures d'éditions françaises par ISBN** ? Le service Couvertures de la BnF est-il réutilisable dans ce cadre ?
4. La règle « fusion uniquement par ISBN identique » et la relecture de l'édition exacte suffisent-elles à garantir que pages, ISBN et couverture correspondent à la même édition ? Vois-tu un cas qui les mélangerait ?
5. La migration `ALTER TABLE ... ADD COLUMN ... CHECK (...)` sur SQLite (iOS) présente-t-elle un risque pour une base existante avec des données (WAL, transaction, version de SQLite embarquée par expo-sqlite) ?
6. Pour distinguer light novels et mangas dans ces catalogues, vois-tu un indice plus fiable que ceux retenus : mentions explicites, « dessin » ou « comic » dans les responsabilités, forme BnF « Romans », éditeur, « non paginé » ?
7. Le parcours d'ajout groupé (auteur commun modifiable, série nouvelle ou existante, doublons décochés, avertissement en cas de langues ou d'éditeurs mélangés) te paraît-il sûr ? Manque-t-il un garde-fou ?

Merci de distinguer ce que tu sais avec certitude de ce que tu supposes.
