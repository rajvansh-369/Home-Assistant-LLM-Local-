// 1.4 Set home. Phase 2 placeholder: an address field and the LLM address, no map yet
// (the point is the 2.2 prefill, or 0, 0). Phase 5 builds the full screen (plan §4.4).
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';

import { PrimaryButton, Screen, Segmented, StepHeader, TextField, TitleBlock } from '@/components';
import { saveHome, SignedOutError } from '@/features/first-run/actions';
import { common, placeholder, setHome as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { useStepBack } from '@/features/first-run/useStepBack';
import { ApiError } from '@/services/api';
import { spacing } from '@/theme';

const radiusOptions = copy.radii.map((m) => ({ value: m, label: copy.radiusLabel(m) }));
const DEFAULT_RADIUS = 150;

export default function SetHome() {
  const onBack = useStepBack('/create-owner');
  const { home, homePrefill } = useFirstRunStore.getState();
  const start = home ?? homePrefill;
  const [address, setAddress] = useState(start?.address ?? '');
  const [radius, setRadius] = useState<number>(start?.radius_m ?? DEFAULT_RADIUS);
  const [wifi, setWifi] = useState(start?.wifi_ssid ?? '');
  const [llmUrl, setLlmUrl] = useState(start?.llm_url ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = address.trim() !== '' && /^https?:\/\/[^/\s]+/.test(llmUrl.trim());

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const route = await saveHome({
        address: address.trim(),
        lat: start?.lat ?? 0,
        lng: start?.lng ?? 0,
        radius_m: radius,
        wifi_ssid: wifi.trim() || null,
        llm_url: llmUrl.trim(),
      });
      router.push(route);
    } catch (e) {
      if (e instanceof SignedOutError) router.replace('/sign-in');
      else setError(e instanceof ApiError ? e.messageFor('llm_url') : common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      gap={spacing.gapSetHome}
      header={<StepHeader step={3} onBack={onBack} />}
      footer={
        <PrimaryButton
          label={copy.submit}
          icon={Check}
          onPress={submit}
          disabled={!canSubmit}
          busy={busy}
        />
      }
    >
      <TitleBlock title={copy.title} subtitle={copy.subtitle} gap={spacing.titleGapSetHome} />
      <TextField label={placeholder.addressLabel} value={address} onChangeText={setAddress} />
      <Segmented label={copy.homeArea} options={radiusOptions} value={radius} onChange={setRadius} />
      <TextField
        label={copy.wifiLabel}
        placeholder={copy.wifiPlaceholder}
        helper={copy.wifiHelper}
        value={wifi}
        onChangeText={setWifi}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        label={copy.llmLabel}
        variant="mono"
        placeholder={copy.llmPlaceholder}
        value={llmUrl}
        onChangeText={setLlmUrl}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        helper={copy.testHint}
        error={error ?? undefined}
      />
    </Screen>
  );
}
