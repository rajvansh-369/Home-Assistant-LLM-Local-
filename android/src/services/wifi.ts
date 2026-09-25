// Current Wi-Fi name for the 1.4 prefill (plan §4.4). Android reports it only while the
// location permission is granted; otherwise it says "<unknown ssid>".
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';

const UNKNOWN_SSID = '<unknown ssid>';

/** Drops Android's quotes and its "<unknown ssid>" placeholder. */
export function normalizeSsid(raw: string | null | undefined): string | null {
  const ssid = raw
    ?.trim()
    .replace(/^"(.*)"$/, '$1')
    .trim();
  return ssid && ssid !== UNKNOWN_SSID ? ssid : null;
}

export async function currentWifiName(): Promise<string | null> {
  const state = await NetInfo.fetch(NetInfoStateType.wifi);
  if (state.type !== NetInfoStateType.wifi || !state.isConnected) return null;
  return normalizeSsid(state.details.ssid);
}
