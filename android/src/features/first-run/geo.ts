// 1.4 Set home geometry and address helpers. Pure functions, unit tested.

export type Point = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distanceM(a: Point, b: Point): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Closed ring of points `radiusM` from `center` (the first point is repeated at the end).
 * Android's map Circle can't be dashed, so the geofence's dashed edge is a Polyline on this ring.
 */
export function circleRing(center: Point, radiusM: number, segments = 72): Point[] {
  const lat = toRad(center.latitude);
  const lng = toRad(center.longitude);
  const d = radiusM / EARTH_RADIUS_M;
  const ring: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const bearing = (2 * Math.PI * (i % segments)) / segments;
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(bearing),
    );
    const lng2 =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(lat),
        Math.cos(d) - Math.sin(lat) * Math.sin(lat2),
      );
    ring.push({ latitude: toDeg(lat2), longitude: toDeg(lng2) });
  }
  return ring;
}

/** A saved or prefilled place has a point unless it's the Phase 2 placeholder's 0, 0. */
export function placePoint(place: { lat: number; lng: number } | null): Point | null {
  if (!place || (place.lat === 0 && place.lng === 0)) return null;
  return { latitude: place.lat, longitude: place.lng };
}

/** Fallback address line when there's no reverse-geocoding result. */
export function formatCoordinates(point: Point): string {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

/** The fields of expo-location's LocationGeocodedAddress that the address line uses. */
export type GeocodedAddress = {
  name?: string | null;
  streetNumber?: string | null;
  street?: string | null;
  district?: string | null;
  city?: string | null;
  formattedAddress?: string | null;
};

/**
 * A short address line: place name, street, district, city, without repeats. Falls back to the
 * geocoder's full formatted address.
 */
export function formatAddress(address: GeocodedAddress): string | null {
  const clean = (value?: string | null) => value?.trim() || null;
  const street = clean(address.street);
  const number = clean(address.streetNumber);
  const streetLine = street ? [number, street].filter(Boolean).join(' ') : null;
  const name = clean(address.name);
  // Android often repeats the street number or the street as the feature name.
  const nameIsStreet = !!name && (name === number || (streetLine?.includes(name) ?? false));
  const parts: string[] = [];
  for (const part of [
    nameIsStreet ? null : name,
    streetLine,
    clean(address.district),
    clean(address.city),
  ]) {
    if (part && !parts.some((p) => p.toLowerCase() === part.toLowerCase())) parts.push(part);
  }
  return parts.length > 0 ? parts.join(', ') : clean(address.formattedAddress);
}
