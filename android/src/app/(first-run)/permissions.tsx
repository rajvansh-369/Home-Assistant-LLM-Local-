// 1.5 Permissions. Phase 2 placeholder: no permission rows yet. Phase 6 builds the full screen
// (plan §4.5). Finish and Skip both end first run and replace the stack with Home.
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';

import { PrimaryButton, Screen, StepHeader, TextLink, TitleBlock } from '@/components';
import { finishFirstRun } from '@/features/first-run/actions';
import { permissions as copy } from '@/features/first-run/copy';
import { useStepBack } from '@/features/first-run/useStepBack';
import { spacing } from '@/theme';

function finish() {
  finishFirstRun();
  router.replace('/home');
}

export default function Permissions() {
  const onBack = useStepBack('/set-home');
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
    </Screen>
  );
}
