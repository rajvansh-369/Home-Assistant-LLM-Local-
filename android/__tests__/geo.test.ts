import {
  circleRing,
  distanceM,
  formatAddress,
  formatCoordinates,
  placePoint,
} from '@/features/first-run/geo';
import { normalizeSsid } from '@/services/wifi';

const center = { latitude: 12.9716, longitude: 77.5946 };

test('the geofence ring is closed and every point is the radius away', () => {
  for (const radius of [100, 150, 300, 500]) {
    const ring = circleRing(center, radius, 36);
    expect(ring).toHaveLength(37);
    expect(ring[36]).toEqual(ring[0]);
    for (const point of ring) expect(distanceM(center, point)).toBeCloseTo(radius, 3);
  }
});

test('a place at 0, 0 has no point yet', () => {
  expect(placePoint(null)).toBeNull();
  expect(placePoint({ lat: 0, lng: 0 })).toBeNull();
  expect(placePoint({ lat: 12.5, lng: 77.25 })).toEqual({ latitude: 12.5, longitude: 77.25 });
});

test('coordinates fallback line', () => {
  expect(formatCoordinates(center)).toBe('12.97160, 77.59460');
});

describe('address line', () => {
  test('name, street, district and city, without repeats', () => {
    expect(
      formatAddress({
        name: 'Maple Court',
        streetNumber: '12',
        street: 'Park Road',
        district: 'Indiranagar',
        city: 'Bengaluru',
        formattedAddress:
          'Maple Court, 12 Park Road, Indiranagar, Bengaluru, Karnataka 560038, India',
      }),
    ).toBe('Maple Court, 12 Park Road, Indiranagar, Bengaluru');
  });

  test('drops a feature name that only repeats the street number or street', () => {
    expect(
      formatAddress({ name: '12', streetNumber: '12', street: 'Park Road', city: 'Pune' }),
    ).toBe('12 Park Road, Pune');
    expect(
      formatAddress({ name: 'Park Road', street: 'Park Road', district: 'Pune', city: 'PUNE' }),
    ).toBe('Park Road, Pune');
  });

  test("falls back to the geocoder's formatted address, then null", () => {
    expect(formatAddress({ formattedAddress: ' Somewhere 1, Town ' })).toBe('Somewhere 1, Town');
    expect(formatAddress({})).toBeNull();
  });
});

test('Wi-Fi name: strips quotes and ignores <unknown ssid>', () => {
  expect(normalizeSsid('"Home-5G"')).toBe('Home-5G');
  expect(normalizeSsid('Home-5G')).toBe('Home-5G');
  expect(normalizeSsid('<unknown ssid>')).toBeNull();
  expect(normalizeSsid('  ')).toBeNull();
  expect(normalizeSsid(null)).toBeNull();
});
