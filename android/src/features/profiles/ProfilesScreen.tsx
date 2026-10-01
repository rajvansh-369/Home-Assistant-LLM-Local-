// 2.3 Profiles (docs/aster-profiles-memory-plan.md §4 2.3), Owner only: every profile with its
// role tag and a one-line summary, Guest's "Allow guest sessions", and "How profiles stay
// private". Summaries come from `GET /profiles/{id}` (B1) where Laravel has it, else just "PIN";
// the Guest switch shows only once Laravel reports Guest's `chat_enabled` (B2). Member and
// Restricted rows open 2.4; "Add a profile" opens it empty.
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronRight,
  Clock,
  HardDrive,
  Inbox,
  Lock,
  UserPlus,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, ScreenHeader, StatusLine, Switch, Text } from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import type { Profile, ProfileRole } from '@/services/api';
import { colors, iconSizes, profileColorKey, radii, sizes, spacing, strokes } from '@/theme';

import { profilesScreen as copy, whoIsUsing } from './copy';
import { refreshHousehold, setGuestAllowed, useManageStore } from './manage';
import { sortProfiles, useProfilesStore, type ProfileSummary } from './store';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

function RoleTag({ role }: { role: ProfileRole }) {
  const owner = role === 'owner';
  return (
    <View style={[styles.tag, owner && styles.tagOwner]}>
      <Text variant="badge" tone={owner ? 'accent' : 'secondary'}>
        {whoIsUsing.roles[role]}
      </Text>
    </View>
  );
}

/** "PIN · Chat · History kept" from the full profile; just "PIN" without it. */
export function profileDetail(details: Profile | undefined): string {
  return copy.detail({ chat: details?.chat_enabled, history: details?.history_enabled });
}

function ProfileRow({
  profile,
  details,
  you,
}: {
  profile: ProfileSummary;
  details?: Profile;
  you: boolean;
}) {
  const fingerprint = useFirstRunStore((state) => state.fingerprintEnabled);
  const detail = profile.role === 'owner' ? copy.ownerDetail(fingerprint) : profileDetail(details);
  const editable = profile.role === 'member' || profile.role === 'restricted';
  return (
    <Pressable
      disabled={!editable}
      onPress={() => router.push({ pathname: '/profile/[id]', params: { id: String(profile.id) } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessible
      accessibilityRole={editable ? 'button' : undefined}
      accessibilityLabel={[
        profile.name,
        whoIsUsing.roles[profile.role],
        you ? copy.you : null,
        detail,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <Avatar color={profileColorKey(profile.color)} name={profile.name} size="header" />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text variant="rowTitle" numberOfLines={1} style={styles.name}>
            {profile.name}
          </Text>
          <RoleTag role={profile.role} />
          {you ? (
            <Text variant="helper" tone="muted">
              {copy.you}
            </Text>
          ) : null}
        </View>
        <Text variant="helper" tone="muted">
          {detail}
        </Text>
      </View>
      {editable ? (
        <ChevronRight size={iconSizes.search} color={colors.textMuted} strokeWidth={strokes.icon} />
      ) : null}
    </Pressable>
  );
}

function GuestRow({ guest, onFailed }: { guest: ProfileSummary; onFailed: () => void }) {
  const details = useManageStore((state) => state.details[guest.id]);
  // Before Laravel had the switch (B2), GET /profiles/{id} wasn't there either: no switch.
  const allowed = details?.chat_enabled;
  return (
    <View style={styles.card}>
      <View style={styles.guestAvatar}>
        <UserRound size={iconSizes.search} color={colors.textMuted} strokeWidth={strokes.icon} />
      </View>
      <View style={styles.text} accessible>
        <View style={styles.titleRow}>
          <Text variant="rowTitle">{whoIsUsing.guest}</Text>
          <RoleTag role="guest" />
        </View>
        <Text variant="helper" tone="muted">
          {copy.guestDetail}
        </Text>
      </View>
      {allowed !== undefined ? (
        <Switch
          value={allowed}
          label={copy.allowGuest}
          onValueChange={(on) =>
            void setGuestAllowed(on).then((saved) => {
              if (!saved) onFailed();
            })
          }
        />
      ) : null}
    </View>
  );
}

function PrivacyLine({
  icon: Icon,
  text,
  first,
}: {
  icon: LucideIcon;
  text: string;
  first: boolean;
}) {
  return (
    <View style={[styles.line, !first && styles.divider]}>
      <Icon size={iconSizes.pill} color={colors.accent} strokeWidth={strokes.icon} />
      <Text variant="bodySmall" tone="secondary" style={styles.lineText}>
        {text}
      </Text>
    </View>
  );
}

export function ProfilesScreen() {
  const profiles = sortProfiles(useProfilesStore((state) => state.profiles));
  const details = useManageStore((state) => state.details);
  const me = useFirstRunStore((state) => state.session?.profile);
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshHousehold().then((fresh) => setNotice(fresh ? null : copy.offline));
    }, []),
  );

  const minutes = me?.auto_lock_minutes ?? null;
  const lines: [LucideIcon, string][] = [
    [Lock, copy.privacyLines[0]],
    [HardDrive, copy.privacyLines[1]],
    [Inbox, copy.privacyLines[2]],
    [Clock, minutes != null ? copy.autoLock(minutes) : copy.noAutoLock],
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader title={copy.title} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="body" tone="secondary">
          {copy.intro}
        </Text>
        {notice ? <StatusLine status={{ tone: 'warning', text: notice }} /> : null}
        <View style={styles.list}>
          {profiles.map((profile) =>
            profile.role === 'guest' ? (
              <GuestRow
                key={profile.id}
                guest={profile}
                onFailed={() => setNotice(copy.saveFailed)}
              />
            ) : (
              <ProfileRow
                key={profile.id}
                profile={profile}
                details={details[profile.id]}
                you={profile.id === me?.id}
              />
            ),
          )}
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/profile/[id]', params: { id: 'new' } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        >
          <UserPlus size={iconSizes.pill} color={colors.accent} strokeWidth={strokes.icon} />
          <Text variant="link">{copy.add}</Text>
        </Pressable>
        <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.label}>
          {copy.privacy}
        </Text>
        <View style={styles.privacy}>
          {lines.map(([icon, text], i) => (
            <PrivacyLine key={text} icon={icon} text={text} first={i === 0} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 4,
    paddingBottom: spacing.contentBottom,
    gap: 14,
  },
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.listCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1 },
  tag: {
    height: sizes.badgeHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.badgeX,
    borderRadius: radii.badge,
    borderWidth: 1,
    borderColor: colors.track,
    backgroundColor: colors.track,
  },
  tagOwner: { borderColor: colors.accentBorder, backgroundColor: colors.accentTint },
  guestAvatar: {
    width: sizes.homeAvatar,
    height: sizes.homeAvatar,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surface2 },
  add: {
    minHeight: 52,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: { marginTop: 10 },
  privacy: {
    borderRadius: radii.listCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  lineText: { flex: 1 },
});
