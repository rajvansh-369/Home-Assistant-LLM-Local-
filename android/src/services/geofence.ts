// Registers the home geofence (plan §7): once 1.5 has "Allow all the time" and a home place
// exists, and again on every app start while that permission holds.
import * as Location from 'expo-location';

import type { Place } from '@/services/api/types';
import { HOME_GEOFENCE_TASK } from '@/tasks/geofence-task';

type HomeArea = Pick<Place, 'lat' | 'lng' | 'radius_m'>;

/** Registers (or replaces) the "home" region. False when there's no home or no background location. */
export async function syncHomeGeofence(home: HomeArea | null): Promise<boolean> {
  if (!home) return false;
  if (!(await Location.getBackgroundPermissionsAsync()).granted) return false;
  await Location.startGeofencingAsync(HOME_GEOFENCE_TASK, [
    {
      identifier: 'home',
      latitude: home.lat,
      longitude: home.lng,
      radius: home.radius_m,
      notifyOnEnter: true,
      notifyOnExit: true,
    },
  ]);
  return true;
}

export function isHomeGeofenceRunning(): Promise<boolean> {
  return Location.hasStartedGeofencingAsync(HOME_GEOFENCE_TASK);
}
