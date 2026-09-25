// Dev-only component gallery (plan §3, Phase 1). Section labels are dev text, not screen copy.
import { Redirect, router } from 'expo-router';
import {
  Bell,
  Check,
  Clock,
  Cloud,
  Fingerprint,
  Lock,
  MapPin,
  MessageSquare,
  Mic,
  RotateCw,
  Server,
  Users,
  Volume2,
  Wifi,
  Zap,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AsterOrb,
  Avatar,
  BackButton,
  BrandMark,
  FeatureRow,
  HomeMap,
  HomePin,
  IconTile,
  InfoCallout,
  Keypad,
  PermissionRow,
  PinDots,
  PrimaryButton,
  ProgressSegments,
  Screen,
  Segmented,
  SmallPill,
  StepHeader,
  SwatchPicker,
  Switch,
  Text,
  TextField,
  TextLink,
  TitleBlock,
  ToggleCard,
  ToggleRow,
} from '@/components';
import {
  common,
  createOwner,
  permissions,
  setHome,
  signIn,
  unlock,
  welcome,
} from '@/features/first-run/copy';
import { colors, type ProfileColor } from '@/theme';

const radiusOptions = setHome.radii.map((m) => ({ value: m, label: setHome.radiusLabel(m) }));

export default function Gallery() {
  if (!__DEV__) return <Redirect href="/" />;
  return <GalleryContent />;
}

function GalleryContent() {
  const [switchOn, setSwitchOn] = useState(true);
  const [switchOff, setSwitchOff] = useState(false);
  const [fingerprint, setFingerprint] = useState(true);
  const [lockWhenLeave, setLockWhenLeave] = useState(true);
  const [radius, setRadius] = useState<number>(150);
  const [colour, setColour] = useState<ProfileColor>('mint');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [testing, setTesting] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [step, setStep] = useState(2);
  const [keypadPin, setKeypadPin] = useState('');
  const [shake, setShake] = useState(0);

  return (
    <Screen header={<View style={styles.header}><BackButton onPress={() => router.back()} /></View>}>
      <Section label="Text variants">
        <Text variant="display">{welcome.headline}</Text>
        <Text variant="title">{signIn.title}</Text>
        <Text variant="name">Name</Text>
        <Text variant="body" tone="secondary">
          {welcome.caption}
        </Text>
        <Text variant="monoSmall" tone="muted">
          monoSmall · helper · status
        </Text>
        <Text variant="badge" tone="accent">
          Owner
        </Text>
      </Section>

      <Section label="BrandMark and AsterOrb (animated, still, small)">
        <BrandMark />
        <View style={styles.orbRow}>
          <AsterOrb />
        </View>
        <View style={styles.row}>
          <AsterOrb size={120} still />
          <AsterOrb size={96} />
        </View>
      </Section>

      <Section label="StepHeader and progress">
        <View style={styles.bleed}>
          <StepHeader step={step} onBack={() => setStep((s) => Math.max(1, s - 1))} />
        </View>
        <PrimaryButton label="Next step" onPress={() => setStep((s) => (s % 4) + 1)} />
        <View style={styles.bleed}>
          <ProgressSegments step={4} />
        </View>
      </Section>

      <Section label="TitleBlock">
        <TitleBlock title={createOwner.title} subtitle={createOwner.subtitle} />
      </Section>

      <Section label="PrimaryButton: normal, pressed, disabled, busy, Check">
        <PrimaryButton label={welcome.cta} onPress={() => {}} />
        <PrimaryButton label={welcome.cta} onPress={() => {}} previewPressed />
        <PrimaryButton label={signIn.submit} onPress={() => {}} disabled />
        <PrimaryButton label={createOwner.submit} onPress={() => {}} busy />
        <PrimaryButton label={setHome.submit} icon={Check} onPress={() => {}} />
      </Section>

      <Section label="TextLink">
        <TextLink label={signIn.registerLink} onPress={() => {}} />
        <TextLink label={permissions.skip} onPress={() => {}} disabled />
      </Section>

      <Section label="TextField: idle, focused, valid, checking, error, mono, pin, disabled">
        <TextField label={signIn.emailLabel} placeholder={signIn.emailPlaceholder} />
        <TextField label={signIn.emailLabel} placeholder={signIn.emailPlaceholder} previewFocused />
        <TextField
          label={signIn.serverLabel}
          variant="mono"
          placeholder={signIn.serverPlaceholder}
          valid
          status={{ tone: 'accent', icon: 'check', text: signIn.reachable(42) }}
        />
        <TextField
          label={signIn.serverLabel}
          variant="mono"
          placeholder={signIn.serverPlaceholder}
          status={{ tone: 'muted', icon: 'spinner', text: signIn.checking }}
        />
        <TextField
          label={signIn.serverLabel}
          variant="mono"
          placeholder={signIn.serverPlaceholder}
          status={{ tone: 'danger', text: signIn.unreachable }}
        />
        <TextField label={signIn.passwordLabel} secureTextEntry error={signIn.needsHttps} />
        <TextField
          label={setHome.llmLabel}
          variant="mono"
          placeholder={setHome.llmPlaceholder}
          status={{ tone: 'warning', icon: Wifi, text: setHome.testHint }}
        />
        <TextField
          label={createOwner.pinLabel}
          variant="pin"
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          autoComplete="off"
          importantForAutofill="no"
          helper={createOwner.pinHelper}
        />
        <TextField label={createOwner.nameLabel} value={name} onChangeText={setName} placeholder={createOwner.namePlaceholder} />
        <TextField label={createOwner.pinLabel} variant="pin" editable={false} />
      </Section>

      <Section label="InfoCallout">
        <InfoCallout icon={Cloud} text={signIn.callout} />
      </Section>

      <Section label="IconTile: accent 36, accent 40, neutral 40">
        <View style={styles.row}>
          <IconTile icon={Server} />
          <IconTile icon={MapPin} size={40} />
          <IconTile icon={Bell} size={40} tone="neutral" />
        </View>
      </Section>

      <Section label="FeatureRow">
        <View style={styles.featureRows}>
          <FeatureRow icon={Server} text={welcome.features.server} />
          <FeatureRow icon={MapPin} text={welcome.features.home} />
          <FeatureRow icon={Lock} text={welcome.features.lock} />
          <FeatureRow icon={Volume2} text={welcome.features.voice} />
        </View>
      </Section>

      <Section label="Switch: on, off, disabled on, disabled off">
        <View style={styles.row}>
          <Switch value={switchOn} onValueChange={setSwitchOn} label="On" />
          <Switch value={switchOff} onValueChange={setSwitchOff} label="Off" />
          <Switch value onValueChange={() => {}} label="Disabled on" disabled />
          <Switch value={false} onValueChange={() => {}} label="Disabled off" disabled />
        </View>
      </Section>

      <Section label="ToggleCard">
        <ToggleCard>
          <ToggleRow
            icon={Fingerprint}
            title={createOwner.fingerprint}
            value={fingerprint}
            onValueChange={setFingerprint}
          />
          <ToggleRow
            icon={Clock}
            title={createOwner.lockWhenLeave}
            subtitle={createOwner.lockWhenLeaveSubtitle}
            value={lockWhenLeave}
            onValueChange={setLockWhenLeave}
          />
          <ToggleRow icon={Fingerprint} title={createOwner.fingerprint} value={false} onValueChange={() => {}} disabled />
        </ToggleCard>
      </Section>

      <Section label="Avatar and SwatchPicker">
        <View style={styles.avatarRow}>
          <Avatar color={colour} name={name} />
          <View style={styles.swatchColumn}>
            <Text variant="label" tone="secondary">
              {common.profileColour}
            </Text>
            <SwatchPicker value={colour} onChange={setColour} />
          </View>
        </View>
        <View style={styles.row}>
          <Avatar color="lilac" name="A" small />
          <Avatar color="sky" name="" />
        </View>
      </Section>

      <Section label="Segmented">
        <Segmented label={setHome.homeArea} options={radiusOptions} value={radius} onChange={setRadius} />
      </Section>

      <Section label="HomePin; HomeMap search bar: idle, searching, locating (map off)">
        <HomePin />
        {([null, 'search', 'locate'] as const).map((finding) => (
          <HomeMap
            key={finding ?? 'idle'}
            point={null}
            radiusM={radius}
            center={null}
            onPick={() => {}}
            query=""
            onQueryChange={() => {}}
            onSearch={() => {}}
            onLocate={() => {}}
            finding={finding}
            labels={{ map: setHome.mapLabel, search: setHome.searchLabel, locate: setHome.locateLabel }}
            mapEnabled={false}
          />
        ))}
      </Section>

      <Section label="SmallPill: idle, busy (tap)">
        <View style={styles.row}>
          <SmallPill
            label={common.test}
            icon={RotateCw}
            busy={testing}
            onPress={() => {
              setTesting(true);
              setTimeout(() => setTesting(false), 1500);
            }}
          />
          <SmallPill label={common.test} icon={RotateCw} onPress={() => {}} busy />
        </View>
      </Section>

      <Section label="PinDots and Keypad (tap digits; delete; shake on 6th)">
        <PinDots filled={keypadPin.length} shakeKey={shake} />
        <Keypad
          onDigit={(d) => {
            const next = (keypadPin + d).slice(0, 6);
            if (next.length === 6) {
              setShake((k) => k + 1);
              setKeypadPin('');
            } else setKeypadPin(next);
          }}
          onDelete={() => setKeypadPin((p) => p.slice(0, -1))}
          onFingerprint={() => {}}
          fingerprintLabel={unlock.fingerprintKey}
          deleteLabel={unlock.deleteKey}
        />
        <Keypad
          onDigit={() => {}}
          onDelete={() => {}}
          disabled
          fingerprintLabel={unlock.fingerprintKey}
          deleteLabel={unlock.deleteKey}
        />
      </Section>

      <Section label="PermissionRow: Allow (tap), note, Allowed, disabled">
        <PermissionRow
          icon={Bell}
          {...permissions.rows.notifications}
          allowed={allowed}
          onAllow={() => setAllowed(true)}
          note={allowed ? undefined : permissions.restrictedHint}
        />
        <PermissionRow icon={MessageSquare} {...permissions.rows.sms} allowed onAllow={() => {}} />
        <PermissionRow icon={MapPin} {...permissions.rows.location} allowed={false} onAllow={() => {}} allowDisabled />
        <PermissionRow icon={Mic} {...permissions.rows.microphone} allowed={false} onAllow={() => {}} />
        <PermissionRow icon={Zap} {...permissions.rows.background} allowed={false} onAllow={() => {}} />
        <PermissionRow icon={Users} {...permissions.rows.contacts} allowed onAllow={() => {}} />
      </Section>
    </Screen>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="monoSmall" tone="accent">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 8 },
  section: {
    gap: 12,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  orbRow: { alignItems: 'center' },
  bleed: { marginHorizontal: -20 },
  featureRows: { gap: 10 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  swatchColumn: { gap: 12 },
});
