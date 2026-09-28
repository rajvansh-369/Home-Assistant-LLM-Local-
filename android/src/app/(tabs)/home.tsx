// 3.1 Home and 3.2 Home away (docs/aster-home-chat-plan.md §4.4, §4.5): one route whose layout
// follows home mode. At home: the status chip, a banner while the model loads or the home PC
// doesn't answer, suggestions and "Ask Aster anything". Away: the map card with the distance, and
// a disabled composer. The avatar locks and returns to 2.1. Both show "Coming up" (reminders plan
// §3). The Owner also sees "Listening · 3 VIPs", "Missed while you were away" at home and the VIP
// card away (docs/aster-messages-alerts-plan.md §3).
import { router } from 'expo-router';
import { AlertTriangle, Clock, Lock, MapPin, MessageCircle, WifiOff } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, AwayMap, Composer, InfoCallout, SuggestionChip, Text } from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { home as copy } from '@/features/home/copy';
import { HomeStatusChip } from '@/features/home-mode/HomeStatusChip';
import { isAtHome, type HomeMode } from '@/features/home-mode/mode';
import { useHomeModeStore } from '@/features/home-mode/store';
import { AwayVipCard, ListeningChip, MissedCard } from '@/features/messages/HomeCards';
import { lockSession } from '@/features/profiles/actions';
import { ComingUp } from '@/features/reminders/ComingUp';
import { hasMapsKey } from '@/services/buildConfig';
import { colors, iconSizes, profileColorKey, radii, sizes, spacing, strokes } from '@/theme';

function startChat(question?: string) {
  router.push({
    pathname: '/chat/[id]',
    params: question ? { id: 'new', q: question } : { id: 'new' },
  });
}

function Banner({ mode }: { mode: HomeMode }) {
  if (mode.kind === 'loading')
    return <InfoCallout icon={Clock} tone="warning" text={copy.loadingBanner} live />;
  if (mode.kind === 'noServer')
    return <InfoCallout icon={WifiOff} tone="warning" text={copy.noServerBanner} live />;
  if (mode.kind === 'failed') {
    return (
      <InfoCallout icon={AlertTriangle} tone="warning" text={copy.failedBanner(mode.error)} live />
    );
  }
  return null;
}

function AwayCard({ mode }: { mode: HomeMode }) {
  const home = useFirstRunStore((state) => state.home);
  const away = mode.kind === 'away' ? mode : null;
  const km = away?.distanceM != null ? (away.distanceM / 1000).toFixed(1) : null;
  const me = away?.me ?? null;
  return (
    <View style={styles.awayCard}>
      {home ? (
        <AwayMap
          home={{ latitude: home.lat, longitude: home.lng }}
          radiusM={home.radius_m}
          me={me}
          label={km ? copy.away.mapLabel(km) : copy.away.mapLabelNoDistance}
          mapEnabled={hasMapsKey}
        />
      ) : null}
      <View style={styles.awayText}>
        <View style={styles.awayTitle}>
          <MapPin size={iconSizes.search} color={colors.textSecondary} strokeWidth={strokes.icon} />
          <Text variant="cardTitle" accessibilityRole="header">
            {km ? copy.away.distance(km) : copy.away.noDistance}
          </Text>
        </View>
        <Text variant="bodySmall" tone="secondary">
          {copy.away.body}
        </Text>
      </View>
    </View>
  );
}

export default function Home() {
  const profile = useFirstRunStore((state) => state.session?.profile);
  const mode = useHomeModeStore((state) => state.mode);
  const atHome = isAtHome(mode);
  const now = new Date();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="monoSmall" tone="muted">
              {copy.dateLine(now)}
            </Text>
            <Text variant="heading" accessibilityRole="header">
              {copy.greeting(now.getHours(), profile?.name ?? '')}
            </Text>
          </View>
          <Pressable
            onPress={lockSession}
            accessibilityRole="button"
            accessibilityLabel={copy.switchOrLock}
            style={styles.avatarButton}
          >
            <Avatar
              color={profileColorKey(profile?.color ?? '')}
              name={profile?.name ?? ''}
              size="header"
            />
            <View style={styles.lockBadge}>
              <Lock
                size={iconSizes.lockBadge}
                color={colors.textSecondary}
                strokeWidth={strokes.icon}
              />
            </View>
          </Pressable>
        </View>

        {atHome ? (
          <>
            <View style={styles.chips}>
              <ListeningChip />
              <HomeStatusChip onPress={() => router.navigate('/settings')} />
            </View>
            <Banner mode={mode} />
            <MissedCard />
          </>
        ) : (
          <>
            <AwayCard mode={mode} />
            <AwayVipCard />
          </>
        )}

        <ComingUp atHome={atHome} />

        {atHome ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestions}
            style={styles.bleed}
          >
            {copy.suggestions.map((question) => (
              <SuggestionChip
                key={question}
                label={question}
                disabled={mode.kind !== 'ready'}
                onPress={() => startChat(question)}
              />
            ))}
          </ScrollView>
        ) : null}
      </ScrollView>

      {atHome ? (
        <View style={styles.entryRow}>
          <Pressable
            onPress={() => startChat()}
            accessibilityRole="button"
            accessibilityLabel={copy.askAnything}
            style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}
          >
            <MessageCircle
              size={iconSizes.composerEntry}
              color={colors.textMuted}
              strokeWidth={strokes.icon}
            />
            <Text variant="body" tone="muted">
              {copy.askAnything}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Composer
          value=""
          onChangeText={() => {}}
          onSend={() => {}}
          unavailable={copy.away.chatAtHome}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.homeTop,
    paddingBottom: 16,
    gap: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  avatarButton: { width: sizes.homeAvatar, height: sizes.homeAvatar },
  lockBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: sizes.lockBadge,
    height: sizes.lockBadge,
    borderRadius: radii.pill,
    backgroundColor: colors.track,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.chipGap, marginTop: -2 },
  bleed: { marginHorizontal: -spacing.screenX },
  suggestions: { gap: spacing.chipGap, paddingHorizontal: spacing.screenX },
  awayCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  awayText: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
  awayTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  entry: {
    height: sizes.composerEntry,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  entryPressed: { backgroundColor: colors.track },
});
