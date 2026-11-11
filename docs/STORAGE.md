# Stratégie de stockage, sauvegarde et restauration

## 1. Stockage local (prioritaire)

| Donnée | Emplacement | Notes |
|---|---|---|
| Base `lecture-sucree.db` | Bac à sable privé (expo-sqlite) | WAL, `foreign_keys=ON`, migrations versionnées (`PRAGMA user_version`) |
| Audio en cours d'enregistrement | `<document>/ExpoAudio/<sessionId>.m4a` | Emplacement imposé par expo-audio (`directory: 'document'`) : persistant, jamais purgé par iOS |
| Audio original | `<document>/lecture-sucree/audio/<AAAA>/<sessionId>.m4a` | Déplacé ici à l'arrêt ; jamais modifié ensuite (la base refuse de le réattacher) ; SHA-256 en base |
| Couvertures | `<document>/lecture-sucree/covers/<id>.<ext>` | Copie locale de l'image choisie |
| Sauvegardes locales | `<document>/lecture-sucree/backups/` | Lot Sauvegardes |
| Exports | `<cache>/lecture-sucree/exports/` | Temporaires, partagés via la feuille de partage système |

- La base ne stocke que des **chemins relatifs**, car le chemin absolu du bac à sable iOS change à chaque réinstallation. Les chemins sont validés pour interdire `../` (testé).
- **Android : `allowBackup=false`** (vérifié dans le manifeste généré). Sinon, Android sauvegarderait automatiquement la base et l'audio dans le Google Drive de l'appareil, sans consentement explicite dans l'app.
- **iOS** : le dossier Documents est inclus dans les sauvegardes iCloud/iTunes **de l'appareil**, que tu contrôles dans les réglages iOS. Une option « exclure de la sauvegarde iCloud de l'appareil » pourra être ajoutée (`NSURLIsExcludedFromBackupKey`, module natif léger).
- **Pas de partage de fichiers iOS** (`UIFileSharingEnabled` non activé) : les données n'apparaissent pas dans l'app Fichiers.

### Robustesse

- Migrations : une transaction par migration, avec arrêt et annulation en cas d'échec (testé). L'app refuse d'ouvrir une base plus récente que son propre code (testé).
- La session est créée en base **avant** la capture. Les segments de transcription sont écrits en ajout seul pendant l'enregistrement.
- Au démarrage, une session restée `recording` est récupérée (audio + segments) et marquée `interrupted`.
- Diagnostic prévu : `PRAGMA integrity_check`, contrôle des fichiers audio orphelins ou manquants, et des empreintes SHA-256.

### Point critique : durée de vie de l'app sur iOS (compte gratuit)

- La signature expire au bout de **7 jours**. Si elle n'est pas rafraîchie, l'app ne se lance plus. Les données **restent sur l'iPhone** (comportement documenté par la communauté, *à vérifier*) et redeviennent accessibles après une réinstallation avec le **même bundle ID**.
- **Supprimer l'app efface toutes ses données.** Les sauvegardes (section 2) sont donc indispensables avant tout usage réel.
- Une mise à jour par AltStore d'un IPA plus récent, avec le même bundle ID, doit conserver les données. *À vérifier au lot 1.*

## 2. Sauvegarde et restauration

### Format `.lsbackup` (archive locale)

```
manifest.json      version du format, version du schéma, date, nombre d'éléments,
                   liste des fichiers avec taille + SHA-256
db.sqlite          instantané cohérent (VACUUM INTO, pas de copie du fichier WAL en cours)
audio/…            fichiers audio (inchangés)
covers/…
```

- **Intégrité** : chaque fichier est vérifié par SHA-256 avant toute restauration. Une archive incomplète ou corrompue est refusée sans rien modifier.
- **Restauration atomique** : la nouvelle base et les fichiers sont d'abord décompressés dans un dossier temporaire, puis vérifiés. On bascule ensuite et l'ancienne version est conservée jusqu'à la confirmation. En cas d'erreur, retour à l'état initial.
- **Reprise après interruption** : les étapes sont idempotentes (un fichier déjà vérifié n'est pas recopié). Un journal de progression permet de reprendre.
- **Schéma** : une sauvegarde d'une version plus ancienne est migrée après la restauration. Une sauvegarde d'une version **plus récente** que l'app est refusée.

### Étape 1 (recommandée) : partage système, sans OAuth

L'archive est créée localement, puis remise à la **feuille de partage** du système. Tu choisis Google Drive, Fichiers, un e-mail, etc. Pour la restauration, tu choisis le fichier avec le sélecteur de documents.
✅ 0 configuration, 0 quota d'API, aucun identifiant Google dans l'app, aucun envoi sans action explicite.
❌ Manuel (pas de sauvegarde automatique).

### Étape 2 (optionnelle) : API Google Drive directe — étude

| Point | Constat | Statut |
|---|---|---|
| Espace | Dossier caché propre à l'app (`appDataFolder`, scope `drive.appdata`) : invisible dans l'interface Drive, inaccessible aux autres apps | Documenté Google, *à vérifier* |
| Classification du scope `drive.appdata` | Non sensible ? Si sensible ou restreint, la vérification de l'app par Google change tout | **À vérifier** avant implémentation |
| Mode « Testing » de l'écran de consentement | Les jetons de rafraîchissement **expirent au bout de 7 jours** (reconnexion hebdomadaire) | Confirmé par plusieurs sources, non testé |
| Passage en « Production » | Supprime la limite de 7 jours. Effet de la classification du scope et de l'avertissement « app non vérifiée » | **À vérifier** |
| iOS + AltStore | L'identifiant client OAuth iOS est lié au bundle ID. Si AltStore modifie le bundle ID (compte gratuit), il faudra enregistrer l'identifiant réel | **À vérifier sur ton iPhone** |
| Quota | 15 Go gratuits partagés avec Gmail et Photos. Quotas d'API Drive larges pour un seul utilisateur | Documenté |
| Gros fichiers | Envoi « resumable » (reprise après coupure réseau) | Documenté |
| Conflits | Jamais d'écrasement : chaque sauvegarde est un instantané horodaté (appareil + date), les N derniers sont conservés, et tu choisis lequel restaurer | Conception |
| Coût | Projet Google Cloud gratuit, **sans compte de facturation** | À confirmer à la création |

**Conclusion provisoire** : Drive ne sert qu'à **stocker des archives** `.lsbackup`, jamais comme base de données. On commence par l'étape 1. L'étape 2 ne sera développée qu'après vérification des points marqués *à vérifier*, et uniquement avec ton accord.
