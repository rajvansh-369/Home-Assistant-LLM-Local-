// 1.4 Set home (plan §4.4): the map with search and current location, the home area, the Wi-Fi
// name and the home LLM address with a real /health test. Save home sends PUT /places/home.
import { router } from 'expo-router';
import { Check, MapPin, RotateCw, Wifi } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, type TextInput } from 'react-native';

import {
  HomeMap,
  IconTile,
  PrimaryButton,
  Screen,
  Segmented,
  SmallPill,
  StatusLine,
  StepHeader,
  Text,
  TextField,
  TitleBlock,
} from '@/components';
import { saveHome, SignedOutError } from '@/features/first-run/actions';
import { common, setHome as copy } from '@/features/first-run/copy';
import { errorMessage } from '@/features/first-run/errors';
import { formatCoordinates, placePoint, type Point } from '@/features/first-run/geo';
import { healthStatus, llmFieldStatus } from '@/features/first-run/llmStatus';
import { useFirstRunStore } from '@/features/first-run/store';
import { useStepBack } from '@/features/first-run/useStepBack';
import { checkLlmUrl } from '@/features/first-run/validators';
import { ApiError, type LlmHealth } from '@/services/api';
import { hasMapsKey, homeLlmHost, isReleaseBuild } from '@/services/buildConfig';
import { checkLlmHealth } from '@/services/llm/health';
import {
  addressLine,
  currentPosition,
  ensureForegroundLocation,
  findAddress,
  hasForegroundLocation,
  lastKnownPosition,
} from '@/services/location';
import { currentWifiName } from '@/services/wifi';
import { colors, iconSizes, spacing, strokes } from '@/theme';

const radiusOptions = copy.radii.map((m) => ({ value: m, label: copy.radiusLabel(m) }));
const DEFAULT_RADIUS = 150;

export default function SetHome() {
  const onBack = useStepBack('/create-owner');
  // A saved home (coming back from 1.5) or the 2.2 prefill from GET /places/home.
  const [start] = useState(() => {
    const { home, homePrefill } = useFirstRunStore.getState();
    return home ?? homePrefill;
  });
  const [startPoint] = useState(() => placePoint(start));

  const [point, setPoint] = useState<Point | null>(startPoint);
  const [address, setAddress] = useState<string | null>(
    startPoint ? (start?.address ?? null) : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [center, setCenter] = useState<Point | null>(null);
  const [query, setQuery] = useState('');
  const [finding, setFinding] = useState<'search' | 'locate' | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const pickId = useRef(0);

  const [radius, setRadius] = useState<number>(
    start && (copy.radii as readonly number[]).includes(start.radius_m)
      ? start.radius_m
      : DEFAULT_RADIUS,
  );
  const [wifi, setWifi] = useState(start?.wifi_ssid ?? '');
  const wifiEdited = useRef(false);

  const [llmUrl, setLlmUrl] = useState(start?.llm_url ?? '');
  const [llmBlurred, setLlmBlurred] = useState(false);
  const [llmServerError, setLlmServerError] = useState<string | null>(null);
  const [test, setTest] = useState<{ url: string; result: LlmHealth } | null>(null);
  const [testing, setTesting] = useState(false);
  const llmRef = useRef<TextInput>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const llm = checkLlmUrl(llmUrl, { homeLlmHost, release: isReleaseBuild });
  const testResult = llm.ok && test?.url === llm.url ? test.result : null;
  const canSubmit = point !== null && address !== null && llm.ok;

  // No prompt on arrival: only use location if it was already granted.
  useEffect(() => {
    let active = true;
    hasForegroundLocation()
      .then((granted) => active && granted && setLocationGranted(true))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Once location is allowed: fill an empty Wi-Fi field, and look around the last fix.
  useEffect(() => {
    if (!locationGranted) return;
    let active = true;
    currentWifiName()
      .then((ssid) => {
        if (active && ssid && !wifiEdited.current) setWifi((current) => current || ssid);
      })
      .catch(() => {});
    if (!startPoint) {
      lastKnownPosition()
        .then((last) => active && last && setCenter(last))
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [locationGranted, startPoint]);

  async function askLocation(): Promise<boolean> {
    const granted = await ensureForegroundLocation().catch(() => false);
    if (granted) setLocationGranted(true);
    return granted;
  }

  /** Moves the pin, then replaces the fallback line with the reverse-geocoded address. */
  async function pick(next: Point, fallback: string | null, canGeocode: boolean) {
    const id = ++pickId.current;
    setPoint(next);
    setNotice(null);
    setAddress(fallback ?? formatCoordinates(next));
    if (!canGeocode) return;
    const line = await addressLine(next).catch(() => null);
    if (line && id === pickId.current) setAddress(line);
  }

  async function search() {
    const q = query.trim();
    if (q === '' || finding) return;
    Keyboard.dismiss();
    setFinding('search');
    setNotice(null);
    try {
      if (!(await askLocation())) {
        setNotice(copy.locationOff);
        return;
      }
      const found = await findAddress(q).catch(() => null);
      if (found) await pick(found, q, true);
      else setNotice(copy.noMatch(q));
    } finally {
      setFinding(null);
    }
  }

  async function locate() {
    if (finding) return;
    Keyboard.dismiss();
    setFinding('locate');
    setNotice(null);
    try {
      // Denied, or location services off: both leave search as the way in.
      const here = (await askLocation()) ? await currentPosition().catch(() => null) : null;
      if (here) await pick(here, null, true);
      else setNotice(copy.locationOff);
    } finally {
      setFinding(null);
    }
  }

  async function runTest() {
    if (!llm.ok || testing) return;
    const url = llm.url;
    setTesting(true);
    try {
      setTest({ url, result: await checkLlmHealth(url) });
    } finally {
      setTesting(false);
    }
  }

  async function submit() {
    if (!point || !address || !llm.ok || busy) return;
    setError(null);
    setLlmServerError(null);
    setBusy(true);
    try {
      const route = await saveHome({
        address,
        lat: point.latitude,
        lng: point.longitude,
        radius_m: radius,
        wifi_ssid: wifi.trim() || null,
        llm_url: llm.url,
      });
      router.push(route);
    } catch (e) {
      if (e instanceof SignedOutError) router.replace('/sign-in');
      else if (e instanceof ApiError && e.fieldErrors.llm_url)
        setLlmServerError(e.messageFor('llm_url'));
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      gap={0}
      contentStyle={styles.flush}
      header={<StepHeader step={3} onBack={onBack} />}
      footer={
        <View style={styles.footer}>
          {error ? (
            <Text variant="status" tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <PrimaryButton
            label={copy.submit}
            icon={Check}
            onPress={submit}
            disabled={!canSubmit}
            busy={busy}
          />
        </View>
      }
    >
      <View style={styles.title}>
        <TitleBlock title={copy.title} subtitle={copy.subtitle} gap={spacing.titleGapSetHome} />
      </View>

      <HomeMap
        point={point}
        radiusM={radius}
        center={center}
        onPick={(next) => void pick(next, null, locationGranted)}
        query={query}
        onQueryChange={(text) => {
          setQuery(text);
          setNotice(null);
        }}
        onSearch={search}
        onLocate={locate}
        finding={finding}
        labels={{ map: copy.mapLabel, search: copy.searchLabel, locate: copy.locateLabel }}
        mapEnabled={hasMapsKey}
      />

      <View style={styles.body}>
        <View style={styles.addressRow}>
          <IconTile icon={MapPin} size={40} />
          <View style={styles.addressText} accessibilityLiveRegion="polite">
            <Text variant="rowTitle">{point ? address : (notice ?? copy.noPoint)}</Text>
            {point ? (
              <Text variant="helper" tone={notice ? 'warning' : 'muted'}>
                {notice ?? copy.withinRadius(radius)}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.labelled}>
          {/* The radio group carries this label for screen readers. */}
          <Text variant="label" tone="secondary" importantForAccessibility="no">
            {copy.homeArea}
          </Text>
          <Segmented
            label={copy.homeArea}
            options={radiusOptions}
            value={radius}
            onChange={setRadius}
          />
        </View>

        <TextField
          label={copy.wifiLabel}
          placeholder={copy.wifiPlaceholder}
          helper={copy.wifiHelper}
          value={wifi}
          onChangeText={(text) => {
            wifiEdited.current = true;
            setWifi(text);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => llmRef.current?.focus()}
        />

        <View style={styles.labelled}>
          <TextField
            ref={llmRef}
            label={copy.llmLabel}
            variant="mono"
            placeholder={copy.llmPlaceholder}
            value={llmUrl}
            onChangeText={(text) => {
              setLlmUrl(text);
              setLlmServerError(null);
            }}
            onBlur={() => setLlmBlurred(true)}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            valid={testResult?.kind === 'ready'}
            status={llmFieldStatus(llm, homeLlmHost, testResult)}
            error={
              llmServerError ??
              (llmBlurred && !llm.ok && llm.reason === 'invalid' ? copy.llmInvalid : undefined)
            }
          />
          <View style={styles.testRow}>
            <View style={styles.testLine}>
              {testResult ? (
                <StatusLine status={healthStatus(testResult, homeLlmHost)} />
              ) : (
                <>
                  <Wifi
                    size={iconSizes.testHint}
                    color={colors.textMuted}
                    strokeWidth={strokes.icon}
                  />
                  <Text variant="helper" tone="muted" style={styles.testHint}>
                    {copy.testHint}
                  </Text>
                </>
              )}
            </View>
            <SmallPill
              label={common.test}
              icon={RotateCw}
              onPress={runTest}
              busy={testing}
              disabled={!llm.ok}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The map runs edge to edge, so each block carries its own padding (§4.4).
  flush: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  title: {
    paddingTop: spacing.setHomeTitleTop,
    paddingHorizontal: spacing.screenX,
    paddingBottom: spacing.setHomeTitleBottom,
  },
  body: {
    paddingTop: spacing.setHomeBodyTop,
    paddingHorizontal: spacing.screenX,
    gap: spacing.gapSetHome,
  },
  footer: {
    paddingTop: spacing.gapSetHome,
    paddingHorizontal: spacing.screenX,
    paddingBottom: spacing.contentBottom,
    gap: spacing.footerGap,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.addressRowGap },
  addressText: { flex: 1 },
  labelled: { gap: spacing.fieldLabelGap },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.testRowGap },
  testLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  testHint: { flexShrink: 1 },
});
