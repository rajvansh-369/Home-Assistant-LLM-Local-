// Plan §2 Colours. The only place hex and rgba colour values may appear (with mapStyle.ts).
export const colors = {
  bg: '#0C1015',
  surface: '#14181D',
  surface2: '#1C2127',
  border: '#2C3239',
  track: '#272C33',
  borderStrong: '#414950',
  text: '#EDF1EE',
  textSecondary: '#B8BEC5',
  textMuted: '#9299A1',
  accent: '#6EECC1',
  accentPressed: '#A8F5DA',
  accentTint: 'rgba(110,236,193,0.10)',
  accentBorder: 'rgba(110,236,193,0.32)',
  accentDeep: '#1F8A68',
  warning: '#FFC667',
  warningTint: 'rgba(255,198,103,0.10)',
  warningBorder: 'rgba(255,198,103,0.34)',
  danger: '#F68678',
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;

// 1.3 swatches and avatars. Order is the swatch order; Mint is the default.
export const profileColors = {
  mint: '#7FD9B8',
  lilac: '#C7AFF5',
  sky: '#82C7F0',
  peach: '#F4B390',
} as const;

export type ProfileColor = keyof typeof profileColors;

// Welcome orb and brand mark (§3.17, §3.18).
export const orbColors = {
  coreStart: '#E4FCF3',
  brandStart: '#D9FBEF',
  mid: colors.accent,
  end: colors.accentDeep,
  outerRing: 'rgba(110,236,193,0.14)',
  innerRing: 'rgba(110,236,193,0.26)',
  pulseRing: 'rgba(110,236,193,0.5)',
  coreGlow: 'rgba(110,236,193,0.42)',
  brandGlow: 'rgba(110,236,193,0.35)',
} as const;

// 1.4 map palette and geofence.
export const mapColors = {
  land: '#0F1419',
  park: '#12241E',
  water: '#12303A',
  minorRoad: '#1D252D',
  majorRoad: '#2A333C',
  geofenceFill: 'rgba(110,236,193,0.12)',
  geofenceStroke: colors.accent,
  searchShadow: 'rgba(0,0,0,0.35)',
} as const;
