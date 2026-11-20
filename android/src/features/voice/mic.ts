// The microphone for 3.6 (docs/aster-voice-plan.md §4): 1.5 Permissions asked for it already; if it
// was skipped, a voice turn asks once more (1.5's own flow, which remembers a refusal for good), and
// a refusal for good points to the app's settings.
import { Linking } from 'react-native';

import { permissionEntries } from '@/services/permissions';

const microphone = permissionEntries.find((entry) => entry.key === 'microphone')!;

export type MicAccess = 'allowed' | 'refused' | 'blocked';

export async function ensureMicrophone(): Promise<MicAccess> {
  try {
    const status = await microphone.check();
    if (status !== 'ask') return status === 'allowed' ? 'allowed' : 'blocked';
    await microphone.request();
    const after = await microphone.check();
    return after === 'allowed' ? 'allowed' : after === 'blocked' ? 'blocked' : 'refused';
  } catch {
    // Let the recognizer try; it reports `permission` if the microphone really is off.
    return 'allowed';
  }
}

/** The microphone is allowed now. Never throws. */
export async function microphoneAllowed(): Promise<boolean> {
  try {
    return (await microphone.check()) === 'allowed';
  } catch {
    return true;
  }
}

export function openAppSettings() {
  void Linking.openSettings().catch(() => {});
}
