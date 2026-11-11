/**
 * Contrat et options du moteur de reconnaissance (expo-speech-recognition →
 * SFSpeechRecognizer d'Apple sur iOS). Ce fichier est PUR (import de types
 * seulement) : la logique est testable sans appareil. L'adaptateur réel est
 * dans deviceEngine.ts.
 */
import type { ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

export const LOCALE = 'fr-FR';

export type EngineErrorCode = string;

export interface SpeechEngineEvents {
  /** La tâche native a réellement démarré (événement `start` du module). */
  start: () => void;
  result: (e: { text: string; isFinal: boolean }) => void;
  error: (e: { code: EngineErrorCode }) => void;
  end: () => void;
}

export interface SpeechEngine {
  start(options: ExpoSpeechRecognitionOptions): void;
  stop(): void;
  abort(): void;
  on<K extends keyof SpeechEngineEvents>(event: K, cb: SpeechEngineEvents[K]): () => void;
}

/**
 * Session audio IDENTIQUE à celle d'expo-audio pendant l'enregistrement
 * (lu dans AudioModule.swift : playAndRecord, mode default, defaultToSpeaker
 * + Bluetooth). Sans cela, le moteur passerait la session en mode
 * « measurement » pendant que l'enregistreur tourne.
 */
const IOS_SESSION_LIKE_RECORDER: ExpoSpeechRecognitionOptions['iosCategory'] = {
  category: 'playAndRecord',
  categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
  mode: 'default',
};

export function liveOptions(allowNetwork: boolean): ExpoSpeechRecognitionOptions {
  return {
    lang: LOCALE,
    interimResults: true,
    continuous: true,
    requiresOnDeviceRecognition: !allowNetwork,
    addsPunctuation: true,
    iosTaskHint: 'dictation',
    iosCategory: IOS_SESSION_LIKE_RECORDER,
  };
}

export function fileOptions(uri: string, allowNetwork: boolean): ExpoSpeechRecognitionOptions {
  return {
    lang: LOCALE,
    interimResults: false,
    continuous: true,
    requiresOnDeviceRecognition: !allowNetwork,
    addsPunctuation: true,
    iosTaskHint: 'dictation',
    audioSource: { uri },
  };
}

/** Identifiant enregistré avec la session (traçabilité). */
export function engineId(allowNetwork: boolean): string {
  return allowNetwork ? 'ios-sfspeech-network-allowed' : 'ios-sfspeech-ondevice';
}

/** Délai maximal : le moteur lit le fichier plus vite que le temps réel ; marge large. */
export function fileTimeoutMs(durationMs: number): number {
  return Math.max(60_000, durationMs * 2 + 30_000);
}

/**
 * Garde-fou de CONFIDENTIALITÉ (relecture du 2026-11-11, bug 4, vérifié dans
 * le Swift du module) : `supportsOnDeviceRecognition()` teste la langue de
 * l'iPhone, pas le français, et le module retire SILENCIEUSEMENT la
 * contrainte « sur l'appareil » si le français ne la prend pas en charge.
 * On ne peut donc garantir le hors-ligne en français que si l'iPhone est
 * lui-même réglé en français. Sinon, sans autorisation du réseau, on refuse.
 */
export function onDeviceFrenchVerifiable(deviceLocale: string): boolean {
  return /^fr([-_]|$)/i.test(deviceLocale.trim());
}
