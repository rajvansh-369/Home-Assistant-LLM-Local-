import type { MapStyleElement } from 'react-native-maps';

import { colors, mapColors } from './colors';

// Plan §4.4 map style, for react-native-maps `customMapStyle`.
export const mapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: mapColors.land }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: colors.textMuted }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: colors.bg }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ visibility: 'on' }, { color: mapColors.park }],
  },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: mapColors.minorRoad }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: mapColors.majorRoad }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: mapColors.majorRoad }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: mapColors.water }] },
];
