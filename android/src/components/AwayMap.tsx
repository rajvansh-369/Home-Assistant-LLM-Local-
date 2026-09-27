// 3.2 map card (docs/aster-home-chat-plan.md §4.5): a still, lite-mode map with the home area and,
// when known, the phone's position. Without a Maps key it's a blank frame, as on 1.4. Lite mode
// draws a bitmap, so markers keep tracking view changes (their snapshot would be empty otherwise).
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { circleRing, type Point } from '@/features/first-run/geo';
import { colors, mapColors, mapStyle, radii, sizes, strokes } from '@/theme';

import { HomePin } from './HomePin';

type AwayMapProps = {
  home: Point;
  radiusM: number;
  /** The phone's last known position. */
  me: Point | null;
  label: string;
  mapEnabled: boolean;
};

const FIT_SEGMENTS = 16;
const FIT_PADDING = 24;

export function AwayMap({ home, radiusM, me, label, mapEnabled }: AwayMapProps) {
  const map = useRef<MapView>(null);
  const fit = [...circleRing(home, radiusM, FIT_SEGMENTS), ...(me ? [me] : [])];

  return (
    <View style={styles.frame} accessible accessibilityRole="image" accessibilityLabel={label}>
      {mapEnabled ? (
        <MapView
          ref={map}
          provider={PROVIDER_GOOGLE}
          liteMode
          style={StyleSheet.absoluteFill}
          customMapStyle={mapStyle}
          loadingBackgroundColor={mapColors.land}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          importantForAccessibility="no-hide-descendants"
          onMapReady={() => {
            map.current?.fitToCoordinates(fit, {
              edgePadding: {
                top: FIT_PADDING,
                right: FIT_PADDING,
                bottom: FIT_PADDING,
                left: FIT_PADDING,
              },
              animated: false,
            });
          }}
          initialRegion={{
            latitude: home.latitude,
            longitude: home.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
        >
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
          {me ? (
            <Marker coordinate={me} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges>
              <View style={styles.me} />
            </Marker>
          ) : null}
        </MapView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: sizes.awayMap,
    backgroundColor: mapColors.land,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    overflow: 'hidden',
  },
  me: {
    width: sizes.meDot,
    height: sizes.meDot,
    borderRadius: radii.pill,
    backgroundColor: mapColors.me,
    borderWidth: 2.5,
    borderColor: colors.text,
  },
});
