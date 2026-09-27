// 2.2 Unlock, profile mode (docs/aster-home-chat-plan.md §4.2): any profile from 2.1. Back returns
// to 2.1; success replaces the stack with Home. The fingerprint key shows only for the Owner, when
// this phone holds the Owner's PIN behind biometrics.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { useFirstRunStore } from '@/features/first-run/store';
import { unlockProfile } from '@/features/profiles/actions';
import { whoIsUsing as copy } from '@/features/profiles/copy';
import { useProfilesStore } from '@/features/profiles/store';
import { UnlockView } from '@/features/profiles/UnlockView';
import { profileColorKey } from '@/theme';

export default function UnlockProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileId = Number(id);
  const profile = useProfilesStore((state) => state.profiles.find((p) => p.id === profileId));
  const ownerId = useFirstRunStore((state) => state.owner?.id);
  const fingerprintEnabled = useFirstRunStore((state) => state.fingerprintEnabled);

  const unlock = useCallback((pin: string) => unlockProfile(profileId, pin), [profileId]);

  const onUnlocked = useCallback(() => {
    // 2.1 stays out of the back stack while a profile is open.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/home');
  }, []);

  if (!profile || profile.role === 'guest') return <Redirect href="/who" />;

  return (
    <UnlockView
      name={profile.name}
      color={profileColorKey(profile.color)}
      badge={copy.roles[profile.role]}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/who'))}
      unlock={unlock}
      onUnlocked={onUnlocked}
      onSignedOut={() => router.replace('/sign-in')}
      fingerprint={profile.id === ownerId && fingerprintEnabled}
    />
  );
}
