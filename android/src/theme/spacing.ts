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
  /** 1.1: headline to feature rows, rows to button, button to caption. */
  welcomeRowsTop: 20,
  welcomeButtonTop: 24,
  welcomeCaptionTop: 12,
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
  // 1.3 avatar row, 2.2 column (§4.3, §4.6).
  avatarRowGap: 20,
  swatchColumnGap: 12,
  unlockX: 28,
  unlockTop: 4,
  unlockBottom: 28,
  unlockNameTop: 14,
  unlockBadgeTop: 6,
  unlockPromptTop: 28,
  unlockDotsTop: 16,
  unlockLineTop: 14,
  unlockKeypadTop: 22,
  badgeX: 7,
  // 1.4 Set home (§4.4): title block 18 20 14, body 16 20 24, search bar inset 12 / 16.
  setHomeTitleTop: 18,
  setHomeTitleBottom: 14,
  setHomeBodyTop: 16,
  mapSearchTop: 12,
  mapSearchX: 16,
  searchBarLeft: 14,
  searchBarRight: 6,
  searchBarGap: 10,
  addressRowGap: 12,
  // Home and chat.
  homeTop: 6,
  profileGridGap: 14,
  chipGap: 8,
  chatX: 20,
  chatGap: 16,
  composerX: 12,
  /** Wi-Fi hint or test result, then the Test pill (proposed: the canvas has no value). */
  testRowGap: 8,
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
  /** 1.1 hides the orb when its free area is shorter than this. */
  orbMin: 96,
  orbInnerInset: 25,
  orbCore: 87,
  orbPulseBorder: 2,
  brandOrb: 22,
  // 2.2 Unlock (§4.6).
  badgeHeight: 20,
  pinDot: 14,
  pinDotBorder: 1.5,
  pinDotGap: 16,
  keyHeight: 64,
  keyGap: 12,
  unlockLine: 20,
  // 1.4 Set home (§4.4).
  map: 270,
  searchBar: 48,
  locateButton: 40,
  homePinWidth: 22,
  homePinHeight: 30,
  homePinDotRadius: 4.2,
  /** Geofence edge: 5 on, 5 off. */
  geofenceDash: 5,
  /** Space kept clear when fitting the circle: the search bar (12 + 48) plus 12 below it. */
  mapFitTop: 72,
  mapFitSide: 24,
  // Home and chat (docs/aster-home-chat-plan.md §3).
  tabBar: 84,
  tabPillWidth: 60,
  tabPillHeight: 30,
  profileAvatar: 72,
  homeAvatar: 46,
  lockBadge: 20,
  statusChip: 34,
  statusDot: 8,
  suggestionChip: 38,
  composerEntry: 56,
  chatInput: 48,
  iconButton: 44,
  sendButton: 44,
  screenHeader: 60,
  orbSmall: 24,
  orbMedium: 48,
  awayMap: 132,
  meDot: 14,
  /** 2.5 header: the dashed Guest circle and the End pill. */
  guestAvatar: 38,
  endPill: 40,
  /** 3.4 answer extras: the status chip, source numbers and rating thumbs. */
  answerChip: 28,
  sourceNumber: 22,
  rateWidth: 36,
  rateHeight: 32,
  // Reminders and location (docs/aster-reminders-location-plan.md §3).
  /** 5.3's map, full width. */
  dayMap: 280,
  /** 5.3's day arrows and the timeline's icon tiles. */
  dayArrow: 40,
  timelineTile: 32,
  /** The dotted path: 1 on, 7 off (canvas), and its width. */
  pathDash: 7,
  pathWidth: 3,
  /** 5.3's Pause button. */
  secondaryButton: 48,
  // Messages and spoken alerts (docs/aster-messages-alerts-plan.md §3).
  rowAvatar: 40,
  threadAvatar: 38,
  miniAvatar: 32,
  countBadge: 22,
  tabBadge: 18,
  /** 4.1 filter chips and 4.2 reply chips. */
  filterChip: 36,
  sourceBadge: 20,
  /** 4.1 catch-up and 3.1 card buttons. */
  cardButton: 40,
  cardButtonTall: 44,
  /** 4.2 Rewrite chips. */
  rewriteChip: 32,
  /** 4.2 "Your reply". */
  draftInput: 76,
  sendReply: 52,
  /** 3.1 "Listening" dot. */
  listeningDot: 8,
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
  keyFingerprint: 28,
  keyDelete: 24,
  search: 18,
  locate: 20,
  testHint: 15,
  /** 5.1 ChoiceCard's radio mark. */
  choiceMark: 22,
  tab: 22,
  roleLock: 14,
  lockBadge: 11,
  guestCard: 32,
  headerAction: 20,
  send: 20,
  composerEntry: 20,
  rate: 16,
  source: 14,
  /** 4.1 section star, 4.2 marker and spoken lines. */
  marker: 13,
  cardButton: 18,
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
  key: 20,
  pill: 999,
  card: 24,
  listCard: 20,
  bubble: 20,
  bubbleTail: 6,
  banner: 16,
  /** The chat field: a pill at one line, rounded corners when it grows. */
  composer: 24,
} as const;

// Touch-target helper: hitSlop that grows a control of `size` to 44.
export const hitSlopFor = (size: number) => {
  const extra = Math.max(0, Math.ceil((sizes.touchTarget - size) / 2));
  return { top: extra, bottom: extra, left: extra, right: extra };
};
