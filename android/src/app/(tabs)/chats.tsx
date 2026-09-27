// 3.3 Chats (docs/aster-home-chat-plan.md §4.6): the unlocked profile's chats from the phone's
// cache, merged with Laravel's list on focus. Search filters titles, New chat opens 3.4, and the
// private-chat card opens a chat that is neither saved nor remembered. Long-press deletes.
import { router, useFocusEffect } from 'expo-router';
import { EyeOff, Lock, Plus, Search, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationRow, IconButton, ScreenHeader, Text } from '@/components';
import { deleteChat } from '@/features/chat/actions';
import { chats as copy } from '@/features/chat/copy';
import { groupChats, lastActivity, previewOf, timeLabel } from '@/features/chat/format';
import { useChatStore } from '@/features/chat/store';
import { syncChats } from '@/features/chat/sync';
import { useFirstRunStore } from '@/features/first-run/store';
import {
  colors,
  iconSizes,
  maxFontSizeMultiplier,
  radii,
  sizes,
  spacing,
  strokes,
  typography,
} from '@/theme';

function confirmDelete(chatUuid: string) {
  Alert.alert(copy.delete, copy.deleteConfirm, [
    { text: copy.cancel, style: 'cancel' },
    { text: copy.delete, style: 'destructive', onPress: () => deleteChat(chatUuid) },
  ]);
}

export default function Chats() {
  const name = useFirstRunStore((state) => state.session?.profile.name ?? '');
  const chats = useChatStore((state) => state.chats);
  const queue = useChatStore((state) => state.queue);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      void syncChats();
    }, []),
  );

  const now = new Date();
  const groups = useMemo(() => groupChats(Object.values(chats), new Date(), query), [chats, query]);
  const waiting = useMemo(() => new Set(queue.map((job) => job.chat)), [queue]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScreenHeader title={copy.title} large>
        <IconButton
          icon={searching ? X : Search}
          label={searching ? copy.closeSearch : copy.search}
          selected={searching}
          onPress={() => {
            setSearching(!searching);
            setQuery('');
          }}
        />
        <IconButton
          icon={Plus}
          label={copy.newChat}
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: 'new' } })}
        />
      </ScreenHeader>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {searching ? (
          <View style={styles.search}>
            <Search size={iconSizes.search} color={colors.textMuted} strokeWidth={strokes.icon} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={copy.searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={copy.search}
              autoFocus
              maxFontSizeMultiplier={maxFontSizeMultiplier}
              style={styles.searchInput}
            />
          </View>
        ) : null}

        <View style={styles.privacy}>
          <Lock size={iconSizes.status} color={colors.textMuted} strokeWidth={strokes.icon} />
          <Text variant="helper" tone="muted" style={styles.flex}>
            {copy.privacy(name)}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: 'private' } })}
          accessibilityRole="button"
          accessibilityLabel={`${copy.privateTitle}, ${copy.privateNote}`}
          style={({ pressed }) => [styles.privateCard, pressed && styles.pressed]}
        >
          <View style={styles.privateIcon}>
            <EyeOff
              size={iconSizes.tileLarge}
              color={colors.textSecondary}
              strokeWidth={strokes.icon}
            />
          </View>
          <View style={styles.flex}>
            <Text variant="rowTitle">{copy.privateTitle}</Text>
            <Text variant="helper" tone="muted">
              {copy.privateNote}
            </Text>
          </View>
        </Pressable>

        {groups.length === 0 ? (
          <Text variant="body" tone="secondary" style={styles.empty}>
            {query.trim() ? copy.noMatch(query.trim()) : copy.empty}
          </Text>
        ) : null}

        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text variant="caps" tone="muted" accessibilityRole="header">
              {group.label}
            </Text>
            <View style={styles.card}>
              {group.chats.map((chat, index) => (
                <ConversationRow
                  key={chat.clientUuid}
                  first={index === 0}
                  title={chat.title}
                  time={timeLabel(lastActivity(chat), now)}
                  preview={previewOf(chat)}
                  pendingLabel={
                    chat.serverId == null || waiting.has(chat.clientUuid)
                      ? copy.waitingUpload
                      : undefined
                  }
                  onPress={() =>
                    router.push({ pathname: '/chat/[id]', params: { id: chat.clientUuid } })
                  }
                  onLongPress={() => confirmDelete(chat.clientUuid)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 24, gap: 14 },
  search: {
    height: sizes.chatInput,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  searchInput: { ...typography.body, flex: 1, color: colors.text, paddingVertical: 0 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  privateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.listCard,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  pressed: { backgroundColor: colors.surface },
  privateIcon: {
    width: sizes.iconTileLarge,
    height: sizes.iconTileLarge,
    borderRadius: radii.tileLarge,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  card: {
    borderRadius: radii.listCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});
