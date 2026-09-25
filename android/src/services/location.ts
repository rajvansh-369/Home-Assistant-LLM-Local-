// Foreground location and geocoding for 1.4 Set home (plan §4.4). Android's geocoder needs the
// foreground location permission, so search asks for it too. Background location is 1.5's job.
import * as Location from 'expo-location';

import { formatAddress, type Point } from '@/features/first-run/geo';

export async function hasForegroundLocation(): Promise<boolean> {
  return (await Location.getForegroundPermissionsAsync()).granted;
}

/** Asks in context. Resolves false without a prompt once Android stops showing it. */
export async function ensureForegroundLocation(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/** First geocoding result for a typed address, or null for no match. */
export async function findAddress(query: string): Promise<Point | null> {
  const [first] = await Location.geocodeAsync(query);
  return first ? { latitude: first.latitude, longitude: first.longitude } : null;
}

/** Throws when location services are off. */
export async function currentPosition(): Promise<Point> {
  const { coords } = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { latitude: coords.latitude, longitude: coords.longitude };
}

/** A cached fix to centre the map on before a point is picked. Never prompts. */
export async function lastKnownPosition(): Promise<Point | null> {
  if (!(await hasForegroundLocation())) return null;
  const last = await Location.getLastKnownPositionAsync().catch(() => null);
  return last ? { latitude: last.coords.latitude, longitude: last.coords.longitude } : null;
}

/** The address line for a point, or null when the geocoder has nothing. */
export async function addressLine(point: Point): Promise<string | null> {
  const [first] = await Location.reverseGeocodeAsync(point);
  return first ? formatAddress(first) : null;
}
