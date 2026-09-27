// 3.4 Chat (docs/aster-home-chat-plan.md §4.7): built in Phase H6. `new` starts a chat, `private`
// a private one; `q` sends a first question.
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components';
import { chat as copy } from '@/features/chat/copy';
import { SessionGate } from '@/features/profiles/SessionGate';
import { colors } from '@/theme';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string; q?: string }>();
  return (
    <SessionGate>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <ScreenHeader
          title={id === 'private' ? copy.privateTitle : copy.newTitle}
          onBack={() => router.back()}
        />
      </SafeAreaView>
    </SessionGate>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
