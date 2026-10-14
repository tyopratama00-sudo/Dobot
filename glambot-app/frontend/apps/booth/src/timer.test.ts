import { expect, test } from 'vitest';
import { ANGLE_MS, sessionEnd } from './store';

test('session end: default per-angle estimate, then the real average', () => {
  expect(sessionEnd(0, 10, 0, 0)).toBe(10 * ANGLE_MS);
  // 2 angles done in 50s → 25s each → 10 angles = 250s
  expect(sessionEnd(1000, 10, 2, 51000)).toBe(1000 + 250000);
});
