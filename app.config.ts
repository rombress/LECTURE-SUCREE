import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuration Expo de Lecture sucrée.
 *
 * - Les dossiers natifs ios/ et android/ sont GÉNÉRÉS (expo prebuild) et ne sont
 *   jamais versionnés : toute configuration native passe par ce fichier ou par
 *   un config plugin dans plugins/.
 * - Aucun secret ici. Les éventuelles valeurs propres à l'utilisateur (ex. futurs
 *   identifiants OAuth Google) seront lues depuis l'environnement (.env local,
 *   non versionné) — voir .env.example.
 * - Version : modifier UNIQUEMENT `version`, `ios.buildNumber`, `android.versionCode`.
 */

const BUNDLE_ID = 'com.lecturesucree.app';

const MIC_PERMISSION =
  'Lecture sucrée utilise le micro pour enregistrer les réflexions que vous dictez pendant une session de lecture. Les enregistrements restent sur votre téléphone.';
const SPEECH_PERMISSION =
  'Lecture sucrée transcrit votre voix en texte pendant une session de lecture. La reconnaissance sur l’appareil est utilisée en priorité.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Lecture sucrée',
  slug: 'lecture-sucree',
  scheme: 'lecturesucree',
  version: '0.2.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0B0A0F',
  // V1 = iPhone uniquement (décision D16). La section `android` ci-dessous
  // est conservée telle quelle pour une V2, mais n'est plus construite ni testée.
  platforms: ['ios'],
  ios: {
    bundleIdentifier: BUNDLE_ID,
    buildNumber: '2',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    versionCode: 1,
    // CONFIDENTIALITÉ : désactive la sauvegarde automatique Android vers le
    // Google Drive de l'appareil (sinon la base SQLite et l'audio pourraient
    // partir vers Google sans consentement explicite dans l'app).
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0B0A0F',
    },
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    ['expo-sqlite', { enableFTS: true }],
    [
      'expo-audio',
      {
        microphonePermission: MIC_PERMISSION,
        // Enregistrement écran verrouillé / app en arrière-plan :
        // iOS -> UIBackgroundModes=audio ; Android -> service de premier plan
        // "microphone" + notification persistante pendant l'enregistrement.
        enableBackgroundRecording: true,
        enableBackgroundPlayback: false,
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: MIC_PERMISSION,
        speechRecognitionPermission: SPEECH_PERMISSION,
        androidSpeechServicePackages: [
          'com.google.android.googlequicksearchbox',
          'com.google.android.as',
        ],
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Lecture sucrée accède à vos photos uniquement pour choisir la couverture d’un livre ou d’une série.',
        // Caméra inutilisée : `false` retire la clé.
        cameraPermission: false,
        // ATTENTION : ne JAMAIS mettre `false` ici — le plugin SUPPRIMERAIT la
        // clé NSMicrophoneUsageDescription dont expo-audio a besoin (vérifié
        // dans le code du plugin). On reprend le même texte.
        microphonePermission: MIC_PERMISSION,
      },
    ],
    './plugins/withAndroidReleaseSigning',
  ],
});
