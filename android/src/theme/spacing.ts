// Plan §2 Spacing, sizes and radii.
export const spacing = {
  screenX: 20,
  /** StepHeader and the 2.2 back row. */
  headerX: 8,
  welcomeX: 24,
  contentTop: 20,
  contentBottom: 24,
  welcomeTop: 8,
  welcomeBottom: 28,
  gapSignIn: 18,
  gapCreateOwner: 20,
  gapSetHome: 16,
  gapPermissions: 18,
  footerGap: 8,
  titleGap: 8,
  titleGapSetHome: 6,
  fieldLabelGap: 8,
  fieldStatusGap: 8,
  featureRowGap: 14,
  featureRowsApart: 10,
  permissionRowsApart: 10,
} as const;

export const sizes = {
  touchTarget: 44,
  header: 56,
  backButton: 44,
  progressHeight: 4,
  progressGap: 6,
  button: 56,
  input: 52,
  textLink: 44,
  iconTileSmall: 36,
  iconTileLarge: 40,
  switchWidth: 52,
  switchHeight: 32,
  switchPadding: 4,
  switchKnob: 22,
  swatch: 36,
  swatchGap: 14,
  swatchRingGap: 3,
  swatchRingWidth: 2,
  avatar: 84,
  segmentItem: 40,
  smallPill: 32,
  allowPill: 36,
  allowedChip: 32,
  orb: 190,
  orbInnerInset: 25,
  orbCore: 87,
  orbPulseBorder: 2,
  brandOrb: 22,
} as const;

export const iconSizes = {
  tileSmall: 19,
  tileLarge: 20,
  back: 22,
  button: 20,
  callout: 20,
  status: 16,
  pill: 14,
  chip: 15,
} as const;

export const strokes = {
  icon: 1.8,
  button: 2,
  check: 2.4,
  geofence: 1.5,
} as const;

export const radii = {
  button: 16,
  input: 14,
  callout: 16,
  toggleCard: 20,
  permissionRow: 18,
  segmentTrack: 14,
  segmentItem: 10,
  tileSmall: 11,
  tileLarge: 12,
  badge: 6,
  pill: 999,
} as const;

// Touch-target helper: hitSlop that grows a control of `size` to 44.
export const hitSlopFor = (size: number) => {
  const extra = Math.max(0, Math.ceil((sizes.touchTarget - size) / 2));
  return { top: extra, bottom: extra, left: extra, right: extra };
};
