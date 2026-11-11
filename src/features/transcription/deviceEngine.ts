/** Adaptateur RÉEL (module natif expo-speech-recognition, iOS). */
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import type { SpeechEngine, SpeechEngineEvents } from './engine';

export const deviceSpeechEngine: SpeechEngine = {
  start: (o) => ExpoSpeechRecognitionModule.start(o),
  stop: () => ExpoSpeechRecognitionModule.stop(),
  abort: () => ExpoSpeechRecognitionModule.abort(),
  on(event, cb) {
    if (event === 'result') {
      const sub = ExpoSpeechRecognitionModule.addListener('result', (e) => {
        (cb as SpeechEngineEvents['result'])({ text: e.results[0]?.transcript ?? '', isFinal: e.isFinal });
      });
      return () => sub.remove();
    }
    if (event === 'error') {
      const sub = ExpoSpeechRecognitionModule.addListener('error', (e) => {
        (cb as SpeechEngineEvents['error'])({ code: e.error });
      });
      return () => sub.remove();
    }
    const sub = ExpoSpeechRecognitionModule.addListener('end', () => (cb as SpeechEngineEvents['end'])());
    return () => sub.remove();
  },
};

/** Disponibilité réelle du moteur (aucune demande de permission ici). */
export function engineAvailability(allowNetwork: boolean): { ok: true } | { ok: false; reason: 'unavailable' | 'no-offline' } {
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return { ok: false, reason: 'unavailable' };
    if (!allowNetwork && !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return { ok: false, reason: 'no-offline' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function requestSpeechPermission(): Promise<boolean> {
  try {
    const r = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return r.granted;
  } catch {
    return false;
  }
}

