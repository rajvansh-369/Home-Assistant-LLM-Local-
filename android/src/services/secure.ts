// expo-secure-store wrapper for the only two secrets kept on the phone (plan §5):
// the device token, and the Owner's PIN when fingerprint unlock is on.
import * as SecureStore from 'expo-secure-store';

const DEVICE_TOKEN = 'aster.device-token';
const BIOMETRIC_PIN = 'aster.biometric-pin';

export const getDeviceToken = () => SecureStore.getItemAsync(DEVICE_TOKEN);
export const setDeviceToken = (token: string) => SecureStore.setItemAsync(DEVICE_TOKEN, token);
export const deleteDeviceToken = () => SecureStore.deleteItemAsync(DEVICE_TOKEN);

/** Android shows a biometric prompt. Rejects if the user cancels it. */
export const saveBiometricPin = (pin: string) =>
  SecureStore.setItemAsync(BIOMETRIC_PIN, pin, { requireAuthentication: true });

/** Android shows a biometric prompt. Resolves with null if nothing is stored. */
export const getBiometricPin = () =>
  SecureStore.getItemAsync(BIOMETRIC_PIN, { requireAuthentication: true });

export const deleteBiometricPin = () => SecureStore.deleteItemAsync(BIOMETRIC_PIN);

export async function clearSecureStore() {
  await Promise.all([deleteDeviceToken(), deleteBiometricPin()]);
}
