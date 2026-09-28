// "Notification access is off…" with Allow, on 4.1 and 4.3 (docs/aster-messages-alerts-plan.md §3).
import { BellOff } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AllowPill, Text } from '@/components';
import { colors, iconSizes, radii, strokes } from '@/theme';

import AsterSystem from '../../../modules/aster-system';

import { messages as copy } from './copy';
import { useThreadsStore } from './threads';

export function AccessCallout() {
  const listening = useThreadsStore((state) => state.listening);
  const loaded = useThreadsStore((state) => state.loaded);
  if (listening || !loaded) return null;
  return (
    <View style={styles.callout}>
      <BellOff size={iconSizes.callout} color={colors.warning} strokeWidth={strokes.icon} />
      <Text variant="bodySmall" style={styles.text}>
        {copy.accessOff}
      </Text>
      <AllowPill
        title={copy.accessTitle}
        onPress={() => AsterSystem.openNotificationListenerSettings()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.callout,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningTint,
  },
  text: { flex: 1 },
});
