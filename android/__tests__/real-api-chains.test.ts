// The two first-run server-call chains in plan §5, through the real client (not the mock) against
// a fake fetch that answers like the Laravel controllers and checks each route's token (§6).
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createOwner,
  deviceName,
  resetFirstRun,
  saveHome,
  signIn,
  SignedOutError,
  startRegistration,
  unlockOwner,
} from '@/features/first-run/actions';
import { signIn as signInCopy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { getDeviceToken } from '@/services/secure';
import { profileColors } from '@/theme';

jest.mock('@/services/api', () => ({
  ...jest.requireActual('@/services/api'),
  api: jest.requireActual('@/services/api/client').realApi,
}));

const server = 'https://aster.test';
const DEVICE = 'device-token-1';
const PROFILE = 'profile-token-1';
const store = () => useFirstRunStore.getState();

type Json = Record<string, unknown>;
type Call = { method: string; path: string; token: string | null; body: Json | null };
type Route = (call: Call) => { status: number; body?: unknown };

const home = {
  address: '1 Test Street',
  lat: 12.5,
  lng: 77.25,
  radius_m: 150,
  wifi_ssid: 'HomeNet',
  llm_url: 'http://192.168.1.20:8000',
};

let calls: Call[];
let routes: Record<string, Route>;

const summary = (p: Json) => ({ id: p.id, name: p.name, color: p.color, role: p.role });
const needs = (token: string, call: Call, then: () => { status: number; body?: unknown }) =>
  call.token === token ? then() : { status: 403, body: { message: 'Wrong token for this route.' } };

/** A household with its Owner (and the Guest Laravel adds), as the controllers return them. */
function laravel(options: { owner?: Json; place?: Json | null } = {}) {
  let owner = options.owner ?? null;
  let place = options.place ?? null;
  const guest = { id: 99, name: 'Guest', color: '#9299A1', role: 'guest' };
  const session = () => ({
    profile_token: PROFILE,
    llm_token: 'llm-token-1',
    expires_at: '2026-09-28T01:00:00Z',
    household_id: 'h1',
    profile: owner,
    engines: [
      { id: 'local', name: 'Local' },
      { id: 'markl', name: 'Jarvis' },
    ],
  });
  const token = { token: DEVICE, household_id: 'h1', user: { id: 1 }, device: { id: 1 } };

  routes = {
    'POST /api/auth/register': () => ({ status: 201, body: token }),
    'POST /api/auth/login': () => ({ status: 200, body: token }),
    'GET /api/profiles': (call) =>
      needs(DEVICE, call, () => ({
        status: 200,
        body: { data: owner ? [summary(owner), guest] : [] },
      })),
    'POST /api/profiles': (call) =>
      needs(DEVICE, call, () => {
        const { pin: _pin, ...fields } = call.body!;
        owner = { id: 1, ...fields, color: String(fields.color).toUpperCase(), llm_engine: 'local' };
        return { status: 201, body: { data: owner } };
      }),
    [`POST /api/profiles/${(options.owner?.id as number) ?? 1}/unlock`]: (call) =>
      needs(DEVICE, call, () => ({ status: 200, body: session() })),
    'GET /api/places/home': (call) =>
      needs(PROFILE, call, () =>
        place ? { status: 200, body: { data: place } } : { status: 404, body: { message: 'No home is saved yet.' } },
      ),
    'PUT /api/places/home': (call) =>
      needs(PROFILE, call, () => {
        place = { id: 5, ...call.body, updated_at: '2026-09-27T10:00:00Z' };
        return { status: 200, body: { data: place } };
      }),
  };
}

function fakeFetch(url: string, init: RequestInit) {
  const path = url.slice(server.length);
  const auth = (init.headers as Record<string, string>).Authorization;
  const call: Call = {
    method: init.method ?? 'GET',
    path,
    token: auth ? auth.replace('Bearer ', '') : null,
    body: init.body ? JSON.parse(String(init.body)) : null,
  };
  calls.push(call);
  const route = routes[`${call.method} ${path}`];
  const { status, body } = route ? route(call) : { status: 404, body: { message: 'Not found.' } };
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  });
}

const trail = () => calls.map((c) => `${c.method} ${c.path} ${c.token ?? '-'}`);

beforeEach(async () => {
  await resetFirstRun();
  await AsyncStorage.clear();
  calls = [];
  globalThis.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
});

test('new household: register, create the Owner, unlock, then save home', async () => {
  laravel();
  startRegistration({ server, email: 'new@example.test', password: 'long-enough' });

  const pin = '482913';
  expect(await createOwner({ name: ' Test ', color: 'sky', pin, fingerprint: false, lockWhenLeave: true })).toBe(
    '/set-home',
  );
  expect(await saveHome(home)).toBe('/permissions');

  expect(trail()).toEqual([
    'POST /api/auth/register -',
    `POST /api/profiles ${DEVICE}`,
    `POST /api/profiles/1/unlock ${DEVICE}`,
    `GET /api/places/home ${PROFILE}`,
    `PUT /api/places/home ${PROFILE}`,
  ]);
  // app_version is left out under Jest, which has no app config version.
  expect(calls[0].body).toMatchObject({
    name: 'Test',
    email: 'new@example.test',
    password: 'long-enough',
    device_name: expect.any(String),
  });
  expect(calls[1].body).toEqual({
    name: 'Test',
    color: profileColors.sky,
    role: 'owner',
    pin,
    auto_lock_minutes: 2,
  });
  expect(calls[2].body).toEqual({ pin });
  expect(calls[4].body).toEqual({ name: 'Home', ...home });

  expect(await getDeviceToken()).toBe(DEVICE);
  // Laravel upper-cases the colour; the Owner still maps back to the Sky swatch.
  expect(store().owner).toEqual({ id: 1, name: 'Test', color: 'sky' });
  expect(store().session).toMatchObject({ profileToken: PROFILE, llmToken: 'llm-token-1' });
  expect(store().home).toMatchObject(home);
});

test('existing household: sign in, find the Owner, unlock, then prefill 1.4', async () => {
  const owner = { id: 7, name: 'Owner', color: '#7FD9B8', role: 'owner', llm_engine: 'markl' };
  const place = { id: 5, name: 'Home', ...home, updated_at: '2026-09-27T10:00:00Z' };
  laravel({ owner, place });

  expect(await signIn({ server, email: 'owner@example.test', password: 'pw' })).toBe('/unlock-owner');
  expect(store().owner).toEqual({ id: 7, name: 'Owner', color: 'mint' });

  expect(await unlockOwner('123456')).toBe('/set-home');

  expect(trail()).toEqual([
    'POST /api/auth/login -',
    `GET /api/profiles ${DEVICE}`,
    `POST /api/profiles/7/unlock ${DEVICE}`,
    `GET /api/places/home ${PROFILE}`,
  ]);
  expect(calls[0].body).toMatchObject({ email: 'owner@example.test', device_name: expect.any(String) });
  expect(store().homePrefill).toMatchObject(home);
  // The server's engine and the admin panel's names arrive with the unlock.
  expect(store().llmEngine).toBe('markl');
  expect(store().engines[1]).toEqual({ id: 'markl', name: 'Jarvis' });
});

test('a 401 on a device-token call signs the phone out and returns to 1.2', async () => {
  laravel();
  routes['GET /api/profiles'] = () => ({ status: 401, body: { message: 'Unauthenticated.' } });

  await expect(signIn({ server, email: 'owner@example.test', password: 'pw' })).rejects.toBeInstanceOf(
    SignedOutError,
  );

  expect(await getDeviceToken()).toBeNull();
  expect(store().hasDeviceToken).toBe(false);
  expect(store().signInNotice).toBe(signInCopy.signInAgain);
});

describe('deviceName', () => {
  test('manufacturer and model, without repeating the maker', () => {
    expect(deviceName('Google', 'Pixel 7')).toBe('Google Pixel 7');
    expect(deviceName('samsung', 'Samsung Galaxy S23')).toBe('Samsung Galaxy S23');
    expect(deviceName(null, 'Pixel 7')).toBe('Pixel 7');
    expect(deviceName('Google', null)).toBe('Google');
    expect(deviceName(null, null)).toBe('Android phone');
    expect(deviceName('X', 'y'.repeat(200))).toHaveLength(100);
  });
});
