// The home-mode chip (docs/aster-home-chat-plan.md §4.1, §4.4, §5): "At home · zephyr-7b ready" on
// 2.1, "At home · zephyr-7b" with a House icon on 3.1.
import { House } from 'lucide-react-native';

import { StatusChip, type StatusTone } from '@/components';
import { activeEngineOf, useFirstRunStore } from '@/features/first-run/store';
import { homeStatus as copy } from '@/features/home/copy';

import { modelLabel, type HomeMode } from './mode';
import { useHomeModeStore } from './store';

export function homeStatusText(
  mode: HomeMode,
  model: string,
  short: boolean,
): { label: string; tone: StatusTone } {
  switch (mode.kind) {
    case 'ready':
      return { label: short ? copy.readyShort(model) : copy.ready(model), tone: 'ready' };
    case 'loading':
      return { label: copy.loading, tone: 'busy' };
    case 'checking':
      return { label: copy.checking, tone: 'busy' };
    case 'noServer':
      return { label: copy.noServer, tone: 'off' };
    case 'failed':
      return { label: copy.failed, tone: 'off' };
    case 'noHome':
      return { label: copy.noHome, tone: 'off' };
    default:
      return { label: copy.away, tone: 'off' };
  }
}

type HomeStatusChipProps = {
  /** 3.1: the short label with a House icon, pressable. */
  onPress?: () => void;
};

export function HomeStatusChip({ onPress }: HomeStatusChipProps) {
  const mode = useHomeModeStore((state) => state.mode);
  const model = useFirstRunStore((state) => modelLabel(activeEngineOf(state), state.engines));
  const { label, tone } = homeStatusText(mode, model, onPress != null);
  return (
    <StatusChip label={label} tone={tone} icon={onPress ? House : undefined} onPress={onPress} />
  );
}
