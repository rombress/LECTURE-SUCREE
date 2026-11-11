# Compilation et installation

> Sous PowerShell, si `npm` affiche « l'exécution de scripts est désactivée », utilise `npm.cmd` et `npx.cmd` (sans rien modifier au système), comme pour le prototype.

## Vérifications locales (Windows)

```powershell
cd <chemin>\LECTURE-SUCREE
npm.cmd ci                  # dépendances exactes + activation des hooks Git
npm.cmd run verify          # confidentialité + TypeScript + ESLint + tous les tests
npm.cmd run doctor          # expo-doctor (version 1.21.6 épinglée : la 1.21.7 est cassée)
npm.cmd run bundle:check    # compile le bundle JS de production iOS
```

`npm run prebuild:ios` échoue sous Windows : c'est normal, Expo exige macOS ou Linux pour iOS. C'est le runner macOS qui s'en charge.

## Android : APK — ⏸ REPORTÉ À LA V2

> V1 = iPhone uniquement (D16). Cette section est conservée pour la V2. Le workflow `android-apk` ne se lance plus que manuellement, et il n'est ni maintenu ni testé en V1.

### Par GitHub Actions (recommandé, rien à installer)
1. Une fois le dépôt publié : **Actions → android-apk → Run workflow**.
2. Télécharge l'artefact `lecture-sucree-apk-…`, puis vérifie l'empreinte :
   `Get-FileHash .\lecture-sucree-*.apk -Algorithm SHA256`
3. Copie l'APK sur le téléphone, autorise l'installation depuis cette source et installe-le.

### Signature : à mettre en place AVANT d'y mettre de vraies données
Sans clé release, l'APK est signé avec une clé **debug jetable** (artefact `…-debug-VERIFICATION`). Il est installable, mais la version suivante ne pourra pas s'installer par-dessus : il faudrait désinstaller, ce qui efface les données.

Créer **une fois pour toutes** une clé release. Il faut `keytool`, fourni avec le JDK 17 gratuit (Eclipse Temurin) :
```powershell
keytool -genkeypair -v -keystore C:\cles-privees\lecture-sucree-release.keystore -alias lecture-sucree -keyalg RSA -keysize 4096 -validity 36500
```
- Stocke le fichier **hors du dossier du projet**, avec une copie de secours hors ligne et les mots de passe dans un gestionnaire de mots de passe.
- Dans GitHub, sous Settings → Secrets and variables → Actions, ajoute :
  `LS_ANDROID_KEYSTORE_BASE64` = résultat de
  `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\cles-privees\lecture-sucree-release.keystore"))`,
  ainsi que `LS_ANDROID_KEYSTORE_PASSWORD`, `LS_ANDROID_KEY_ALIAS` et `LS_ANDROID_KEY_PASSWORD`.

### Compilation locale (optionnelle)
Il faut JDK 17 et le SDK Android (Android Studio ou outils en ligne de commande, gratuits, plusieurs Go). Aucun des deux n'est installé sur ce PC au 2026-11-11. Ensuite :
`npm.cmd run prebuild:android`, puis `cd android` et `.\gradlew.bat assembleRelease`, avec les variables `LS_ANDROID_*` définies dans le terminal pour signer avec ta clé.

## iOS : IPA via AltServer (chaîne validée par le prototype)

1. **Actions → ios-ipa → Run workflow** (runner `macos-26`, gratuit en dépôt **public**).
2. Télécharge `lecture-sucree-unsigned-ipa` et vérifie le SHA-256.
3. Installe-le avec AltServer, en suivant le protocole du prototype (`READLOG-iOS-TEST/docs/TEST-PROTOCOL.md`, étapes 4 à 7). Rappels **impératifs** :
   - **identifiant Apple secondaire uniquement** : le compte principal a été verrouillé par Apple lors du test ;
   - **une seule** instance d'AltServer, lancée en administrateur ;
   - iTunes et iCloud **non Microsoft Store**, ouverts pendant l'opération ;
   - **une seule tentative** : en cas d'erreur, on s'arrête et on note le message.
4. Rafraîchis la signature dans AltStore → My Apps → **Refresh All** avant 7 jours, avec AltServer actif sur le même réseau.

### Limites du compte Apple gratuit (documentées par AltStore)
- 7 jours de validité ; 3 apps actives au maximum (AltStore compris) ; 10 App IDs par période de 7 jours.
- Pas de push, d'iCloud, d'*associated domains*, ni de Sign in with Apple. Le workflow **échoue volontairement** si un de ces entitlements apparaît.
- Les permissions utilisées (micro, reconnaissance vocale, audio en arrière-plan) sont de simples clés `Info.plist`, pas des capabilities. Leur bon fonctionnement après signature AltServer est **à vérifier** (lot 1, écran Diagnostic).

## Versions

Modifier uniquement `version`, `ios.buildNumber` et `android.versionCode` dans `app.config.ts`. Chaque nouvelle installation doit **incrémenter** `buildNumber` et `versionCode`.
