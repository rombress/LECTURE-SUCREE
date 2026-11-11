// @ts-check
/**
 * Config plugin : signature Android "release" à partir de VARIABLES
 * D'ENVIRONNEMENT, jamais de fichier versionné.
 *
 * Au moment de la compilation Gradle :
 *  - si LS_ANDROID_KEYSTORE_PATH, LS_ANDROID_KEYSTORE_PASSWORD,
 *    LS_ANDROID_KEY_ALIAS et LS_ANDROID_KEY_PASSWORD sont TOUTES définies,
 *    l'APK release est signé avec cette clé (stable => mises à jour possibles
 *    sans désinstaller, donc sans perte de données) ;
 *  - sinon, Gradle retombe sur la clé de debug (APK de VÉRIFICATION seulement :
 *    la clé de debug change d'une machine/runner à l'autre, une mise à jour
 *    exigerait de désinstaller l'app et donc d'effacer ses données).
 *
 * Le keystore lui-même vit hors du dépôt (machine locale ou secret GitHub
 * Actions encodé en base64). Voir docs/BUILD.md.
 */
const { withAppBuildGradle, createRunOncePlugin } = require('expo/config-plugins');

const MARKER = '// @lecture-sucree/release-signing';

const SIGNING_BLOCK = `
    ${MARKER}
    def lsKeystorePath = System.getenv("LS_ANDROID_KEYSTORE_PATH")
    def lsHasReleaseKey = lsKeystorePath != null && !lsKeystorePath.isEmpty() &&
        System.getenv("LS_ANDROID_KEYSTORE_PASSWORD") != null &&
        System.getenv("LS_ANDROID_KEY_ALIAS") != null &&
        System.getenv("LS_ANDROID_KEY_PASSWORD") != null
    if (lsHasReleaseKey) {
        signingConfigs {
            lsRelease {
                storeFile file(lsKeystorePath)
                storePassword System.getenv("LS_ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("LS_ANDROID_KEY_ALIAS")
                keyPassword System.getenv("LS_ANDROID_KEY_PASSWORD")
            }
        }
        buildTypes.release.signingConfig signingConfigs.lsRelease
        println("[lecture-sucree] APK release signé avec la clé release (variables LS_ANDROID_*).")
    } else {
        println("[lecture-sucree] ATTENTION : clé release absente, APK signé avec la clé DEBUG (vérification uniquement).")
    }
`;

/** @param {string} gradle */
function applySigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  // On ajoute le bloc à la fin du bloc `android { ... }` : on l'insère juste
  // avant la ligne qui suit la fermeture de buildTypes, de façon robuste en
  // cherchant le dernier "}" du bloc android.
  const androidStart = gradle.search(/^android\s*\{/m);
  if (androidStart === -1) {
    throw new Error('[withAndroidReleaseSigning] bloc android { } introuvable dans app/build.gradle');
  }
  let depth = 0;
  let end = -1;
  for (let i = gradle.indexOf('{', androidStart); i < gradle.length; i++) {
    const c = gradle[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error('[withAndroidReleaseSigning] fin du bloc android { } introuvable');
  }
  return gradle.slice(0, end) + SIGNING_BLOCK + gradle.slice(end);
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withAndroidReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('[withAndroidReleaseSigning] build.gradle Groovy attendu');
    }
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });

module.exports = createRunOncePlugin(withAndroidReleaseSigning, 'withAndroidReleaseSigning', '1.0.0');
module.exports.applySigning = applySigning;
