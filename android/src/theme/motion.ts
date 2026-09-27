// Plan §2 Motion.
export const motion = {
  orbRingMs: 2600,
  orbRingScaleFrom: 0.82,
  orbRingScaleTo: 1.18,
  orbRingOpacityFrom: 0.7,
  orbCoreMs: 3200,
  orbCoreScale: 1.05,
  progressFillMs: 200,
  switchKnobMs: 150,
  /** 2.2 wrong-PIN shake (proposed: the canvas names the shake, not its timing). */
  shakeDistance: 10,
  shakeStepMs: 50,
  /** 2.2 "PIN accepted" pause before moving on. */
  unlockContinueMs: 600,
  /** Status dot pulse (canvas `aster-pulse`: 2.2 s, grows 2.6 times and fades by 70 %). */
  pulseMs: 2200,
  pulseScale: 2.6,
  /** The blinking cursor while an answer streams (proposed). */
  cursorMs: 500,
} as const;
