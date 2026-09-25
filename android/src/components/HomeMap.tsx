// 1.4 map (§4.4): dark Google map, 270 tall and full width, with the search bar overlaid, the
// home pin and the geofence. Tap or long-press moves the pin.
import { LocateFixed, Search } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PixelRatio,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useReducedMotion } from 'react-native-reanimated';

import { circleRing, type Point } from '@/features/first-run/geo';
import {
  colors,
  hitSlopFor,
  iconSizes,
  mapColors,
  mapStyle,
  maxFontSizeMultiplier,
  radii,
  sizes,
  spacing,
  strokes,
  typography,
} from '@/theme';

import { HomePin } from './HomePin';

/** Zoom used to show the last known fix before a point is picked. */
const CENTER_ZOOM = 15;
/** Lets react-native-svg draw the pin before the marker's bitmap is frozen. */
const PIN_SNAPSHOT_MS = 250;
/** Fewer points than the drawn ring are enough to fit the camera. */
const FIT_SEGMENTS = 16;

// Android's Polyline takes dash lengths in pixels; the canvas's 5 / 5 is in dp.
const dash = PixelRatio.getPixelSizeForLayoutSize(sizes.geofenceDash);

type HomeMapProps = {
  point: Point | null;
  radiusM: number;
  /** Where to look before a point is picked, e.g. the last known fix. */
  center: Point | null;
  onPick: (point: Point) => void;
  query: string;
  onQueryChange: (text: string) => void;
  onSearch: () => void;
  onLocate: () => void;
  /** Spinner in the search icon or the locate button; both are disabled meanwhile. */
  finding: 'search' | 'locate' | null;
  labels: { map: string; search: string; locate: string };
  /** False when the build has no Maps key: a blank frame instead of a crash. */
  mapEnabled?: boolean;
};

export function HomeMap({
  point,
  radiusM,
  center,
  onPick,
  query,
  onQueryChange,
  onSearch,
  onLocate,
  finding,
  labels,
  mapEnabled = true,
}: HomeMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const reduceMotion = useReducedMotion();

  // Fit the circle after the pin or the radius changes, clear of the search bar.
  useEffect(() => {
    if (!ready) return;
    if (point) {
      map.current?.fitToCoordinates(circleRing(point, radiusM, FIT_SEGMENTS), {
        edgePadding: {
          top: sizes.mapFitTop,
          right: sizes.mapFitSide,
          bottom: sizes.mapFitSide,
          left: sizes.mapFitSide,
        },
        animated: !reduceMotion,
      });
    } else if (center) {
      map.current?.animateCamera({ center, zoom: CENTER_ZOOM }, { duration: reduceMotion ? 0 : undefined });
    }
  }, [ready, point, radiusM, center, reduceMotion]);

  return (
    <View style={styles.frame}>
      {mapEnabled ? (
        <MapView
          ref={map}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          customMapStyle={mapStyle}
          accessibilityLabel={labels.map}
          onMapReady={() => setReady(true)}
          onPress={(e) => onPick(e.nativeEvent.coordinate)}
          onLongPress={(e) => onPick(e.nativeEvent.coordinate)}
          loadingBackgroundColor={mapColors.land}
          toolbarEnabled={false}
          showsMyLocationButton={false}
          moveOnMarkerPress={false}
          rotateEnabled={false}
          pitchEnabled={false}
        >
          {point ? (
            <>
              <Circle
                center={point}
                radius={radiusM}
                fillColor={mapColors.geofenceFill}
                strokeColor={colors.transparent}
                strokeWidth={0}
              />
              <Polyline
                coordinates={circleRing(point, radiusM)}
                strokeColor={mapColors.geofenceStroke}
                strokeWidth={strokes.geofence}
                lineDashPattern={[dash, dash]}
                lineCap="butt"
              />
              <PinMarker point={point} />
            </>
          ) : null}
        </MapView>
      ) : null}

      <View style={styles.searchBar}>
        {finding === 'search' ? (
          <ActivityIndicator size={iconSizes.search} color={colors.textMuted} />
        ) : (
          <Search size={iconSizes.search} color={colors.textMuted} strokeWidth={strokes.icon} />
        )}
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          onSubmitEditing={onSearch}
          placeholder={labels.search}
          accessibilityLabel={labels.search}
          returnKeyType="search"
          autoCorrect={false}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          editable={finding === null}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={styles.searchInput}
        />
        <Pressable
          onPress={onLocate}
          disabled={finding !== null}
          hitSlop={hitSlopFor(sizes.locateButton)}
          accessibilityRole="button"
          accessibilityLabel={labels.locate}
          accessibilityState={{ disabled: finding !== null, busy: finding === 'locate' }}
          style={({ pressed }) => [styles.locate, pressed && styles.locatePressed]}
        >
          {finding === 'locate' ? (
            <ActivityIndicator size={iconSizes.locate} color={colors.accent} />
          ) : (
            <LocateFixed size={iconSizes.locate} color={colors.accent} strokeWidth={strokes.icon} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** Custom marker: the bitmap is drawn once, then tracksViewChanges goes off. */
function PinMarker({ point }: { point: Point }) {
  const [tracking, setTracking] = useState(true);
  return (
    <Marker coordinate={point} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={tracking}>
      <View
        collapsable={false}
        onLayout={() => setTimeout(() => setTracking(false), PIN_SNAPSHOT_MS)}
      >
        <HomePin />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: sizes.map,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: mapColors.land,
  },
  map: StyleSheet.absoluteFill,
  searchBar: {
    position: 'absolute',
    top: spacing.mapSearchTop,
    left: spacing.mapSearchX,
    right: spacing.mapSearchX,
    height: sizes.searchBar,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    boxShadow: `0 8px 24px ${mapColors.searchShadow}`,
    paddingLeft: spacing.searchBarLeft,
    paddingRight: spacing.searchBarRight,
    gap: spacing.searchBarGap,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // TextInput ignores lineHeight well on Android only when height is fixed, so drop it here.
  searchInput: {
    ...typography.body,
    lineHeight: undefined,
    color: colors.text,
    flex: 1,
    height: '100%',
    paddingVertical: 0,
  },
  locate: {
    width: sizes.locateButton,
    height: sizes.locateButton,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locatePressed: { backgroundColor: colors.surface2 },
});
