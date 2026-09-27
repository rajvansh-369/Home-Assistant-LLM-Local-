// 3.4 / 3.5 an answer (docs/aster-home-chat-plan.md §4.7): the orb, a status chip while it
// streams ("Searching the web", "Used 2 memories"), the text, and when it ends the web sources,
// "Live answer…", the rating thumbs, Continue, or the error that cut it short.
import { ExternalLink, Globe, Play, Search, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { chat as copy } from '@/features/chat/copy';
import type { Source } from '@/services/api/types';
import { colors, iconSizes, radii, sizes, spacing, strokes } from '@/theme';

import { MarkdownText } from './MarkdownText';
import { OrbDot } from './OrbDot';
import { SmallPill } from './SmallPill';
import { Text } from './Text';

type AssistantMessageProps = {
  content: string;
  streaming?: boolean;
  /** While streaming: what zypherLL is doing, e.g. "Searching the web". */
  status?: string | null;
  sources?: Source[];
  live?: boolean;
  rating?: 'good' | 'bad' | null;
  /** Only answers zypherLL remembered (`memory_id`) can be rated. */
  onRate?: (rating: 'good' | 'bad') => void;
  /** `finish_reason: "length"`: the answer hit its limit. */
  onContinue?: () => void;
  stopped?: boolean;
  error?: string | null;
};

function domainOf(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/:?#]+)/i.exec(url);
  return match ? match[1] : url;
}

function Sources({ sources }: { sources: Source[] }) {
  return (
    <View style={styles.sources}>
      {sources.map((source, index) => {
        const n = source.n ?? index + 1;
        const title = source.title?.trim() || domainOf(source.url);
        return (
          <Pressable
            key={`${n}-${source.url}`}
            onPress={() => void Linking.openURL(source.url).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel={copy.source(n, title)}
            style={({ pressed }) => [styles.source, pressed && styles.sourcePressed]}
          >
            <View style={styles.sourceNumber}>
              <Text variant="monoSmall" tone="accent">
                {n}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="bodySmall" numberOfLines={1}>
                {title}
              </Text>
              <Text variant="helper" tone="muted" numberOfLines={1}>
                {domainOf(source.url)}
              </Text>
            </View>
            <ExternalLink
              size={iconSizes.source}
              color={colors.textMuted}
              strokeWidth={strokes.icon}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function RateButton({
  kind,
  selected,
  onPress,
}: {
  kind: 'good' | 'bad';
  selected: boolean;
  onPress: () => void;
}) {
  const Icon = kind === 'good' ? ThumbsUp : ThumbsDown;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={kind === 'good' ? copy.good : copy.bad}
      accessibilityState={{ selected }}
      hitSlop={6}
      style={[styles.rate, selected && styles.rateSelected]}
    >
      <Icon
        size={iconSizes.rate}
        color={selected ? colors.accent : colors.textMuted}
        strokeWidth={strokes.icon}
      />
    </Pressable>
  );
}

export function AssistantMessage({
  content,
  streaming = false,
  status,
  sources = [],
  live = false,
  rating,
  onRate,
  onContinue,
  stopped = false,
  error,
}: AssistantMessageProps) {
  const waiting = streaming && content === '';
  return (
    <View style={styles.row}>
      <OrbDot size={sizes.orbSmall} />
      <View style={styles.column}>
        {streaming && status ? (
          <View style={styles.statusChip} accessibilityLiveRegion="polite">
            <Search size={iconSizes.pill} color={colors.textSecondary} strokeWidth={strokes.icon} />
            <Text variant="helper" tone="secondary">
              {status}
            </Text>
          </View>
        ) : null}
        {!streaming && sources.length > 0 ? (
          <View style={styles.statusChip}>
            <Search size={iconSizes.pill} color={colors.textSecondary} strokeWidth={strokes.icon} />
            <Text variant="helper" tone="secondary">
              {copy.searched(sources.length)}
            </Text>
          </View>
        ) : null}

        {waiting && !status ? (
          <View style={styles.thinking} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Text variant="helper" tone="muted">
              {copy.status.thinking}
            </Text>
          </View>
        ) : null}
        {content ? <MarkdownText source={content} /> : null}

        {!streaming && sources.length > 0 ? <Sources sources={sources} /> : null}
        {!streaming && live ? (
          <View style={styles.note}>
            <Globe size={iconSizes.pill} color={colors.textMuted} strokeWidth={strokes.icon} />
            <Text variant="helper" tone="muted">
              {copy.live}
            </Text>
          </View>
        ) : null}
        {!streaming && stopped ? (
          <Text variant="helper" tone="muted">
            {copy.stopped}
          </Text>
        ) : null}
        {error ? (
          <Text variant="status" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        {!streaming && (onRate || onContinue) ? (
          <View style={styles.actions}>
            {onRate ? (
              <>
                <RateButton
                  kind="good"
                  selected={rating === 'good'}
                  onPress={() => onRate('good')}
                />
                <RateButton kind="bad" selected={rating === 'bad'} onPress={() => onRate('bad')} />
                {rating ? (
                  <Text variant="helper" tone="muted" style={styles.flex}>
                    {rating === 'good' ? copy.ratedGood : copy.ratedBad}
                  </Text>
                ) : null}
              </>
            ) : null}
            {onContinue ? (
              <SmallPill label={copy.continue} icon={Play} onPress={onContinue} />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0, gap: 10 },
  statusChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: sizes.answerChip,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: sizes.orbSmall },
  sources: {
    borderRadius: radii.banner,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: spacing.chipGap + 4,
    minHeight: sizes.touchTarget,
  },
  sourcePressed: { backgroundColor: colors.surface2 },
  sourceNumber: {
    width: sizes.sourceNumber,
    height: sizes.sourceNumber,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rate: {
    width: sizes.rateWidth,
    height: sizes.rateHeight,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateSelected: { borderColor: colors.accentBorder, backgroundColor: colors.accentTint },
});
