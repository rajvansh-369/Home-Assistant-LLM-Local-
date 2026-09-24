import { resolveFirstRunRoute, type FirstRunFacts } from '@/features/first-run/routing';

const fresh: FirstRunFacts = {
  firstRunDone: false,
  hasDeviceToken: false,
  serverEntered: false,
  hasOwner: false,
  homeSaved: false,
  unlocked: false,
  permissionsDone: false,
};

const signedIn = { hasDeviceToken: true, serverEntered: true };

// One or more cases per row of plan §5 "Launch routing".
test.each<[string, Partial<FirstRunFacts>, string]>([
  ['1 first run done', { ...signedIn, firstRunDone: true, hasOwner: true, homeSaved: true }, '/home'],
  ['1 wins over everything', { firstRunDone: true }, '/home'],
  ['2 no token, no server', {}, '/welcome'],
  ['3 no token, server entered', { serverEntered: true }, '/sign-in'],
  ['3 token lost after the Owner exists', { serverEntered: true, hasOwner: true, homeSaved: true }, '/sign-in'],
  ['4 token, no Owner', signedIn, '/create-owner'],
  ['5 Owner, no home, locked', { ...signedIn, hasOwner: true }, '/unlock-owner'],
  ['6 unlocked, no home', { ...signedIn, hasOwner: true, unlocked: true }, '/set-home'],
  ['7 home saved, permissions not done', { ...signedIn, hasOwner: true, homeSaved: true }, '/permissions'],
  ['7 home saved and unlocked', { ...signedIn, hasOwner: true, homeSaved: true, unlocked: true }, '/permissions'],
])('row %s', (_name, facts, route) => {
  expect(resolveFirstRunRoute({ ...fresh, ...facts })).toBe(route);
});
