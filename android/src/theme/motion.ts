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
} as const;
