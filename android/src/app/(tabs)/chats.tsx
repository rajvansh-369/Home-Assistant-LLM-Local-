// 3.3 Chats: filled in Phase H5 (docs/aster-home-chat-plan.md §4.6).
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components';
import { chats as copy } from '@/features/chat/copy';
import { colors } from '@/theme';

export default function Chats() {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScreenHeader title={copy.title} large />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
