import { expect, test } from 'vitest';
import { isFreeMode } from './payment-mode';

test('uses explicit admin mode instead of inferring free mode from zero price', () => {
  expect(isFreeMode({ freeMode: false, pricing: { firstPrint: 0 } })).toBe(false);
  expect(isFreeMode({ freeMode: true, pricing: { firstPrint: 30000 } })).toBe(true);
  expect(isFreeMode({ pricing: { firstPrint: 0 } })).toBe(false);
});
