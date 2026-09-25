// 1.5 Permissions (plan §4.5, §7): six rows with their true status, refreshed on mount and each
// time the app comes back to the foreground. Finish and Skip both end first run into Home.
import { router } from 'expo-router';
import {
  Bell,
  Check,
  MapPin,
  MessageSquare,
  Mic,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { PermissionRow, PrimaryButton, Screen, StepHeader, TextLink, TitleBlock } from '@/components';
import { finishFirstRun } from '@/features/first-run/actions';
import { permissions as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { useStepBack } from '@/features/first-run/useStepBack';
import { syncHomeGeofence } from '@/services/geofence';
import {
  checkAll,
  permissionEntries,
  type PermissionEntry,
  type PermissionKey,
  type PermissionStatus,
} from '@/services/permissions';
import { spacing } from '@/theme';

const icons: Record<PermissionKey, LucideIcon> = {
  notifications: Bell,
  sms: MessageSquare,
  location: MapPin,
  microphone: Mic,
  background: Zap,
  contacts: Users,
};

/**
 * A system screen that didn't take the app to the background (rare) must not leave the pills
 * disabled for good.
 */
const RETURN_GRACE_MS = 1500;

/** Android 13+ can grey out notification access for an APK installed outside a store (§7). */
const mayRestrictSettings = () => Number(Platform.Version) >= 33;

type Statuses = Record<PermissionKey, PermissionStatus>;

export default function Permissions() {
  const onBack = useStepBack('/set-home');
  const [statuses, setStatuses] = useState<Statuses | null>(null);
  const [pending, setPending] = useState<PermissionKey | null>(null);
  /** Came back from Notification access settings at least once. */
  const [triedNotifications, setTriedNotifications] = useState(false);
  /** An Allow opened a screen outside the app; the pills wait for the app to come back. */
  const awaitingReturn = useRef(false);
  const leftApp = useRef(false);

  const refresh = useCallback(() => checkAll().then(setStatuses), []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        leftApp.current = true;
        return;
      }
      if (awaitingReturn.current) {
        awaitingReturn.current = false;
        setPending(null);
      }
      void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // "Location, all the time" allowed and a home saved at 1.4: register the geofence (§7).
  const locationAllowed = statuses?.location === 'allowed';
  useEffect(() => {
    if (locationAllowed) syncHomeGeofence(useFirstRunStore.getState().home).catch(() => {});
  }, [locationAllowed]);

  async function allow(entry: PermissionEntry) {
    if (pending) return;
    setPending(entry.key);
    leftApp.current = false;
    const outcome = await entry.request().catch(() => 'done' as const);
    if (outcome === 'opened') {
      if (entry.key === 'notifications') setTriedNotifications(true);
      awaitingReturn.current = true;
      setTimeout(() => {
        if (awaitingReturn.current && !leftApp.current) {
          awaitingReturn.current = false;
          setPending(null);
          void refresh();
        }
      }, RETURN_GRACE_MS);
      return;
    }
    setPending(null);
    await refresh();
  }

  function finish() {
    const skipped = permissionEntries
      .map((entry) => entry.key)
      .filter((key) => statuses?.[key] !== 'allowed');
    finishFirstRun(skipped);
    router.replace('/home');
  }

  return (
    <Screen
      gap={spacing.gapPermissions}
      header={<StepHeader step={4} onBack={onBack} />}
      footer={
        <>
          <PrimaryButton label={copy.finish} icon={Check} onPress={finish} />
          <TextLink label={copy.skip} onPress={finish} />
        </>
      }
    >
      <TitleBlock title={copy.title} subtitle={copy.subtitle} />
      <View style={styles.rows}>
        {permissionEntries.map((entry) => (
          <PermissionRow
            key={entry.key}
            icon={icons[entry.key]}
            title={copy.rows[entry.key].title}
            description={copy.rows[entry.key].description}
            allowed={statuses?.[entry.key] === 'allowed'}
            onAllow={() => void allow(entry)}
            allowDisabled={statuses === null || pending !== null}
            note={
              entry.key === 'notifications' &&
              triedNotifications &&
              pending === null &&
              statuses?.notifications !== 'allowed' &&
              mayRestrictSettings()
                ? copy.restrictedHint
                : undefined
            }
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.permissionRowsApart },
});
