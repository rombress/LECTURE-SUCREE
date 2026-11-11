# Sécurité du dépôt public

Le dépôt est **PUBLIC**. Il ne doit contenir **aucune** donnée personnelle ni aucun secret. `.gitignore` ne suffit pas : il ne protège pas un fichier **déjà suivi** et n'empêche pas un `git add -f`.

## Couches de protection

| # | Couche | Ce qu'elle bloque | Où |
|---|---|---|---|
| 1 | `.gitignore` strict | Bases, audio, exports, sauvegardes, clés, `.env`, builds, dossiers natifs | `.gitignore` |
| 2 | **Hook pre-commit** | Contenu **indexé** : chemins interdits, fichiers hors liste blanche, signatures binaires (SQLite/audio/keystore/zip même renommés), motifs de secrets, e-mails, termes personnels, **e-mail Git non noreply** | `.githooks/pre-commit` → `scripts/privacy-check.mjs --staged` |
| 3 | **Hook pre-push** | Tous les fichiers suivis **et tout l'historique** (un secret supprimé reste dans l'historique), identités des commits | `.githooks/pre-push` |
| 4 | **CI** | Les mêmes contrôles, sur le serveur, à chaque push (impossible à contourner avec `--no-verify`) | `.github/workflows/ci.yml` |
| 5 | GitHub *secret scanning* + *push protection* | Les jetons connus des grands fournisseurs | **À activer** dans Settings → Code security (gratuit pour les dépôts publics) |

Les hooks s'activent automatiquement à l'`npm install` (`core.hooksPath=.githooks`). Vérification : `git config core.hooksPath` doit afficher `.githooks`.

> **N'utilise jamais `git commit --no-verify`.** Si le contrôle bloque à tort, corrige la règle dans `scripts/privacy-check.mjs` (avec un test), puis relance.

## Liste blanche

Tout fichier suivi doit correspondre à une règle de `ALLOWED_PATHS` (code, docs, configuration, icônes). Un fichier inattendu, par exemple `notes.txt` ou `ma-biblio.json` à la racine, **bloque le commit**. Pour ajouter un emplacement légitime, modifie la règle de façon explicite.

## Termes personnels (`.privacy-denylist`)

Crée à la racine un fichier **`.privacy-denylist`**. Il est ignoré par Git et lui-même interdit par le contrôle. Mets-y un terme par ligne : prénom et nom réels, e-mails, identifiant Apple, pseudonymes, titres de ta bibliothèque réelle si tu veux. Tout commit qui contient l'un de ces termes est bloqué, et le terme n'est **jamais affiché** dans les messages.

```
# exemple (valeurs fictives)
Prénom Nom
mon.adresse@example.com
```

En CI, tu peux ajouter le secret GitHub `PRIVACY_DENYLIST` (termes séparés par des virgules). Il reste privé.

## Identité Git

L'e-mail d'auteur des commits est publié dans l'historique public. Il doit donc être soit une adresse **noreply GitHub** (`<ID>+<pseudo>@users.noreply.github.com`), soit une adresse **fictive explicitement autorisée** dans `ALLOWED_AUTHOR_EMAILS` (`scripts/privacy-check.mjs`). Le hook bloque toute autre adresse.

État vérifié le 2026-11-11 : l'identité Git configurée est une **adresse fictive non identifiante**, autorisée explicitement. *Correction* : un rapport précédent affirmait à tort que le prototype READLOG-iOS-TEST exposait une adresse réelle. Il s'agit de la même adresse fictive : aucune action n'est nécessaire.

Recommandé en complément : GitHub → Settings → Emails → **Block command line pushes that expose my email**.

## Secrets de build

- **Keystore Android** : il est créé et stocké **hors du dossier du projet**, avec une copie de secours hors ligne. En CI, il est passé en base64 dans les secrets GitHub `LS_ANDROID_*`. Le workflow le décode dans `$RUNNER_TEMP` et le supprime en fin de job.
  **Le perdre empêche toute mise à jour sans désinstaller l'app, donc sans perdre les données.**
- **Identifiant Apple** : saisi **uniquement dans AltServer**, jamais dans le dépôt, jamais dans GitHub.
- **Google OAuth** (lot futur) : identifiants dans `.env` local et dans les secrets GitHub. Aucun secret client n'est utilisé pour une app mobile (flux PKCE).

## Données utilisateur

- Elles ne vivent que dans le bac à sable de l'app (voir [STORAGE.md](STORAGE.md)) et dans les espaces que tu autorises explicitement (partage, Drive).
- **Données de test entièrement fictives** (« Auteur Fictif », `example.com`…).
- **Journaux sans contenu personnel** : `src/services/log.ts` masque toute chaîne libre (titres, transcriptions, chemins, e-mails). ESLint interdit `console.*` ailleurs.

## En cas de fuite

1. **Révoquer ou changer le secret immédiatement** : c'est la seule mesure efficace, car un dépôt public peut déjà avoir été copié.
2. Supprimer le fichier, puis réécrire l'historique (`git filter-repo`). C'est une opération destructive qui exige un force-push : elle ne se fait qu'avec ton accord explicite.
3. Relancer `npm run privacy:history`.
