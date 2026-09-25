// Runtime permissions the user refused with "Don't ask again". Android's check() can't tell those
// from never-asked ones, so they're remembered here and Allow opens the app's settings instead.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BLOCKED_PERMISSIONS_KEY = 'aster.permissions.blocked';

async function load(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(BLOCKED_PERMISSIONS_KEY);
  return new Set(raw ? (JSON.parse(raw) as string[]) : []);
}

async function save(blocked: Set<string>) {
  await AsyncStorage.setItem(BLOCKED_PERMISSIONS_KEY, JSON.stringify([...blocked]));
}

export async function isAnyBlocked(permissions: readonly string[]): Promise<boolean> {
  const blocked = await load();
  return permissions.some((p) => blocked.has(p));
}

export async function markBlocked(permissions: readonly string[]) {
  if (permissions.length === 0) return;
  const blocked = await load();
  permissions.forEach((p) => blocked.add(p));
  await save(blocked);
}

/** Granted later (e.g. from the app's settings page): forget the refusal. */
export async function clearBlocked(permissions: readonly string[]) {
  const blocked = await load();
  if (!permissions.some((p) => blocked.has(p))) return;
  permissions.forEach((p) => blocked.delete(p));
  await save(blocked);
}
