// 2.1 Who's using (docs/aster-home-chat-plan.md §4.1): every launch after first run starts here.
// Profiles come from GET /profiles, cached so the grid opens offline. A profile opens 2.2; Guest
// opens a Guest session (2.5). This is the stack's root, so Android back leaves the app.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OrbDot, ProfileCard, Screen, Text, TextLink } from '@/components';
import { SignedOutError } from '@/features/first-run/actions';
import { common } from '@/features/first-run/copy';
import { HomeStatusChip } from '@/features/home-mode/HomeStatusChip';
import { loadProfiles, openGuestSession } from '@/features/profiles/actions';
import { whoIsUsing as copy } from '@/features/profiles/copy';
import { sortProfiles, useProfilesStore, type ProfileSummary } from '@/features/profiles/store';
import { ApiError } from '@/services/api';
import { profileColorKey, sizes, spacing } from '@/theme';

type LoadState = 'loading' | 'fresh' | 'stale';

function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

export default function WhoIsUsing() {
  const cached = useProfilesStore((state) => state.profiles);
  const [load, setLoad] = useState<LoadState>('loading');
  const [guestBusy, setGuestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let active = true;
    loadProfiles()
      .then((result) => active && setLoad(result.fresh ? 'fresh' : 'stale'))
      .catch((e) => {
        if (e instanceof SignedOutError) router.replace('/sign-in');
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(refresh);

  async function openGuest() {
    setError(null);
    setGuestBusy(true);
    try {
      await openGuestSession();
      router.push('/guest');
    } catch (e) {
      if (e instanceof SignedOutError) router.replace('/sign-in');
      else
        setError(
          e instanceof ApiError && e.status === 0 ? common.noConnection : common.somethingWrong,
        );
    } finally {
      setGuestBusy(false);
    }
  }

  const profiles = sortProfiles(cached);
  const people = profiles.filter((p) => p.role !== 'guest');
  const guest = profiles.find((p) => p.role === 'guest');
  const cards: (ProfileSummary | 'guest')[] = guest ? [...people, 'guest'] : people;

  return (
    <Screen
      gap={0}
      contentStyle={styles.column}
      footer={
        <View style={styles.footer}>
          <HomeStatusChip />
        </View>
      }
    >
      <View style={styles.intro}>
        <OrbDot size={sizes.orbMedium} />
        <Text variant="titleLarge" accessibilityRole="header" style={styles.center}>
          {copy.title}
        </Text>
        <Text variant="body" tone="secondary" style={styles.center}>
          {copy.subtitle}
        </Text>
      </View>

      {load === 'stale' && cards.length > 0 ? (
        <Text
          variant="status"
          tone="warning"
          style={styles.notice}
          accessibilityLiveRegion="polite"
        >
          {copy.loadFailed}
        </Text>
      ) : null}

      <View style={styles.grid}>
        {pairs(cards).map((row) => (
          <View key={row.map((c) => (c === 'guest' ? 'guest' : c.id)).join('-')} style={styles.row}>
            {row.map((card) =>
              card === 'guest' ? (
                <ProfileCard
                  key="guest"
                  name={copy.guest}
                  note={copy.guestNote}
                  hint={copy.guestHint}
                  guest
                  disabled={guestBusy}
                  onPress={openGuest}
                />
              ) : (
                <ProfileCard
                  key={card.id}
                  name={card.name}
                  note={copy.roles[card.role]}
                  hint={copy.lockedHint}
                  color={profileColorKey(card.color)}
                  onPress={() => router.push({ pathname: '/unlock/[id]', params: { id: card.id } })}
                />
              ),
            )}
            {row.length === 1 ? <View style={styles.spacer} /> : null}
          </View>
        ))}
      </View>

      {load !== 'loading' && cards.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="body" tone="secondary" style={styles.center}>
            {copy.noProfiles}
          </Text>
          <TextLink label={copy.retry} onPress={refresh} />
        </View>
      ) : null}

      {error ? (
        <Text variant="status" tone="danger" style={styles.notice} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { paddingTop: 28 },
  intro: { alignItems: 'center', gap: 16 },
  center: { textAlign: 'center' },
  notice: { marginTop: 16, textAlign: 'center' },
  grid: { marginTop: 32, gap: spacing.profileGridGap },
  row: { flexDirection: 'row', gap: spacing.profileGridGap },
  spacer: { flex: 1 },
  empty: { marginTop: 24, alignItems: 'center', gap: 8 },
  footer: { alignItems: 'center', paddingTop: 24 },
});
