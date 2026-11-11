# Lecture sucrée

Application mobile **personnelle** de journal de lecture vocal. **V1 : iPhone uniquement** (installation via AltStore/AltServer, compte Apple gratuit) ; Android est prévu en V2. On organise sa bibliothèque (séries → tomes), puis on dicte ses réflexions pendant la lecture : l'audio original est conservé et la transcription apparaît en direct. Les sessions sont consultables, cherchables et exportables.

> Usage strictement personnel. Pas de store public, pas de réseau social, **budget 0 €**.
> Ce dépôt est public : il ne contient **que du code**. Aucune donnée personnelle (voir [docs/SECURITY.md](docs/SECURITY.md)).

## État : lot 0 (fondations)

| Élément | État |
|---|---|
| Architecture, documentation, structure | ✅ |
| Protection du dépôt public (hooks + CI + liste blanche) | ✅ testée localement |
| Schéma SQLite v1 (séries, tomes, sessions, catégories, FTS5) | ✅ testé sous Node ; ⏳ appareil |
| Écrans squelettes + écran *Diagnostic technique* | ✅ compilés ; ⏳ appareil |
| Build IPA sur GitHub Actions (`macos-26`) | ✅ workflow écrit ; ⏳ premier run (dépôt non publié) |
| Android | ⏸ reporté à la V2 (workflow conservé, lancement manuel uniquement) |
| **MVP audio** : bibliothèque, fiche, enregistrement vocal, historique, réécoute (sans transcription ni sauvegarde) | ✅ code + 60 tests locaux ; export audio via Partager ; ⏳ iPhone ([protocole](docs/TEST-PROTOCOL-MVP.md)) |

Détail des résultats : [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md).

## Documentation

| Document | Contenu |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Vue d'ensemble, pile technique, modèle de données, arborescence |
| [DECISIONS.md](docs/DECISIONS.md) | Décisions validées et décisions à vérifier |
| [STACK-IOS.md](docs/STACK-IOS.md) | React Native + Expo ou Swift natif pour la V1 iPhone |
| [reviews/](docs/reviews/) | Demandes de relecture externe et réponses |
| [TRANSCRIPTION.md](docs/TRANSCRIPTION.md) | Comparaison des solutions de transcription gratuites |
| [STORAGE.md](docs/STORAGE.md) | Stockage local, sauvegarde et restauration, étude Google Drive |
| [SECURITY.md](docs/SECURITY.md) | Règles du dépôt public, hooks, identité Git, conduite en cas de fuite |
| [BUILD.md](docs/BUILD.md) | Compilation Android/iOS, signature, installation AltServer |
| [COSTS.md](docs/COSTS.md) | Coûts et limites des offres gratuites |
| [ROADMAP.md](docs/ROADMAP.md) | Lots de développement |
| [TEST-RESULTS.md](docs/TEST-RESULTS.md) | Résultats réellement observés |
| [DATA-SAFETY.md](docs/DATA-SAFETY.md) | **Ce qui est protégé et ce qui ne l'est pas (à lire avant l'usage réel)** |
| [TEST-PROTOCOL-MVP.md](docs/TEST-PROTOCOL-MVP.md) | Protocole de test du MVP sur iPhone |

## Démarrage rapide (Windows, PowerShell)

```powershell
cd <chemin>\LECTURE-SUCREE
npm.cmd ci              # installe les dépendances et active les hooks Git
npm.cmd run verify      # confidentialité + TypeScript + ESLint + tests
npm.cmd run doctor      # diagnostic Expo
```

L'e-mail d'auteur Git doit être une adresse noreply GitHub ou une adresse fictive autorisée, sinon le hook bloque le commit (voir [SECURITY.md](docs/SECURITY.md#identité-git)).

## Pile

Expo SDK 58 · React Native 0.88 · TypeScript · expo-router · expo-sqlite (FTS5) · expo-audio · expo-speech-recognition · GitHub Actions (ubuntu pour la CI, macos-26 pour l'IPA) · AltStore/AltServer.
