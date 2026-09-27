// 5.3 map (docs/aster-reminders-location-plan.md §3): full width, 280 tall, the home area and pin,
// the day's path as a dotted line and the last point as the sky dot. Without a Maps key it's a
// blank frame, as on 1.4. The camera fits the home area and every point.
import { useEffect, useRef } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { circleRing, type Point } from '@/features/first-run/geo';
import { colors, mapColors, mapStyle, radii, sizes, strokes } from '@/theme';

import { HomePin } from './HomePin';

type DayMapProps = {
  home: Point | null;
  radiusM: number;
  /** The day's points, oldest first. */
  path: Point[];
  label: string;
  mapEnabled: boolean;
};

const FIT_SEGMENTS = 16;
const FIT_PADDING = 36;
// Android's Polyline takes dash lengths in pixels; the canvas's 1 / 7 is in dp.
const dash = [
  PixelRatio.getPixelSizeForLayoutSize(1),
  PixelRatio.getPixelSizeForLayoutSize(sizes.pathDash),
];

export function DayMap({ home, radiusM, path, label, mapEnabled }: DayMapProps) {
  const map = useRef<MapView>(null);
  const fit = [...(home ? circleRing(home, radiusM, FIT_SEGMENTS) : []), ...path];
  const last = path.at(-1) ?? null;
  const fitKey = fit.map((p) => `${p.latitude},${p.longitude}`).join('|');

  useEffect(() => {
    if (fit.length === 0) return;
    map.current?.fitToCoordinates(fit, {
      edgePadding: { top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING },
      animated: false,
    });
    // Only when the points change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const center = home ?? last;
  return (
    <View style={styles.frame} accessible accessibilityRole="image" accessibilityLabel={label}>
      {mapEnabled && center ? (
        <MapView
          ref={map}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          customMapStyle={mapStyle}
          loadingBackgroundColor={mapColors.land}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          importantForAccessibility="no-hide-descendants"
          initialRegion={{ ...center, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
          onMapReady={() =>
            fit.length > 0 &&
            map.current?.fitToCoordinates(fit, {
              edgePadding: {
                top: FIT_PADDING,
                right: FIT_PADDING,
                bottom: FIT_PADDING,
                left: FIT_PADDING,
              },
              animated: false,
            })
          }
        >
          {home ? (
            <>
              <Circle
                center={home}
                radius={radiusM}
                fillColor={mapColors.geofenceFill}
                strokeColor={mapColors.geofenceStroke}
                strokeWidth={strokes.geofence}
              />
              <Marker coordinate={home} anchor={{ x: 0.5, y: 1 }} tracksViewChanges>
                <HomePin />
              </Marker>
            </>
          ) : null}
          {path.length > 1 ? (
            <Polyline
              coordinates={path}
              strokeColor={mapColors.path}
              strokeWidth={sizes.pathWidth}
              lineDashPattern={dash}
              lineCap="round"
            />
          ) : null}
          {last ? (
            <Marker coordinate={last} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges>
              <View style={styles.last} />
            </Marker>
          ) : null}
        </MapView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: sizes.dayMap,
    backgroundColor: mapColors.land,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  last: {
    width: sizes.meDot,
    height: sizes.meDot,
    borderRadius: radii.pill,
    backgroundColor: mapColors.me,
    borderWidth: 2.5,
    borderColor: colors.text,
  },
});
