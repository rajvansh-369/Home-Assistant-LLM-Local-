import { colors, hitSlopFor, profileColors, radii, sizes, typography } from '@/theme';

// A sample of §2 values, so an accidental edit to the theme fails loudly.
test('colours match plan §2', () => {
  expect(colors.bg).toBe('#0C1015');
  expect(colors.surface).toBe('#14181D');
  expect(colors.accent).toBe('#6EECC1');
  expect(colors.accentTint).toBe('rgba(110,236,193,0.10)');
  expect(colors.textMuted).toBe('#9299A1');
  expect(colors.danger).toBe('#F68678');
  expect(profileColors).toEqual({
    mint: '#7FD9B8',
    lilac: '#C7AFF5',
    sky: '#82C7F0',
    peach: '#F4B390',
  });
});

test('typography matches plan §2', () => {
  expect(typography.display).toMatchObject({
    fontFamily: 'BricolageGrotesque_700Bold',
    fontSize: 35,
    lineHeight: 38,
    letterSpacing: -0.7,
  });
  expect(typography.body).toMatchObject({ fontFamily: 'Manrope_400Regular', fontSize: 15, lineHeight: 22 });
  expect(typography.pin).toMatchObject({ fontFamily: 'JetBrainsMono_400Regular', letterSpacing: 8.8 });
  expect(typography.badge.textTransform).toBe('uppercase');
});

test('no text style sets fontWeight, and all drop font padding', () => {
  for (const style of Object.values(typography)) {
    expect(style).not.toHaveProperty('fontWeight');
    expect(style.includeFontPadding).toBe(false);
  }
});

test('sizes and radii match plan §2', () => {
  expect(sizes.button).toBe(56);
  expect(sizes.input).toBe(52);
  expect(radii.button).toBe(16);
  expect(radii.toggleCard).toBe(20);
});

test('hitSlopFor grows small controls to 44', () => {
  expect(hitSlopFor(36)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
  expect(hitSlopFor(32).top).toBe(6);
  expect(hitSlopFor(56).top).toBe(0);
});
