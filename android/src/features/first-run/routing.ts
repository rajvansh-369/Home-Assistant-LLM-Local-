// Launch routing (plan §5): the first rule that matches wins. Pure, so it can be tested per row.

export type FirstRunRoute =
  | '/home'
  | '/welcome'
  | '/sign-in'
  | '/create-owner'
  | '/unlock-owner'
  | '/set-home'
  | '/permissions';

export type FirstRunFacts = {
  firstRunDone: boolean;
  hasDeviceToken: boolean;
  serverEntered: boolean;
  hasOwner: boolean;
  homeSaved: boolean;
  /** An unexpired profile token from this app session. */
  unlocked: boolean;
  permissionsDone: boolean;
};

export function resolveFirstRunRoute(facts: FirstRunFacts): FirstRunRoute {
  if (facts.firstRunDone) return '/home'; // 1. Later rows switch this to 2.1 Who's using.
  if (!facts.hasDeviceToken) return facts.serverEntered ? '/sign-in' : '/welcome'; // 2, 3
  if (!facts.hasOwner) return '/create-owner'; // 4
  if (!facts.homeSaved) return facts.unlocked ? '/set-home' : '/unlock-owner'; // 5, 6
  return '/permissions'; // 7 (also covers "permissions done" without "first run done")
}
