import { expect, test } from 'vitest';
import { freeModeOutdated, isFreeMode } from './payment-mode';

test('uses explicit admin mode instead of inferring free mode from zero price', () => {
  expect(isFreeMode({ freeMode: false, pricing: { firstPrint: 0 } })).toBe(false);
  expect(isFreeMode({ freeMode: true, pricing: { firstPrint: 30000 } })).toBe(true);
  expect(isFreeMode({ pricing: { firstPrint: 0 } })).toBe(false);
});

test('only a free page that is asked to wait for payment counts as outdated', () => {
  const free = { freeMode: true, pricing: { firstPrint: 0 } };
  expect(freeModeOutdated(free, 'WAITING_PAYMENT')).toBe(true);
  expect(freeModeOutdated(free, 'PAYMENT_SUCCESS')).toBe(false);
  expect(freeModeOutdated({ freeMode: false, pricing: { firstPrint: 0 } }, 'WAITING_PAYMENT')).toBe(false);
});
