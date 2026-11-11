import { expect, test } from 'vitest';
import { photoPose } from './capture-pose';

test('a photo belongs to the pose whose countdown fired, even if the robot moved on', () => {
  // Shutter fired at pose 1; the robot is already at pose 2 when the photo lands.
  expect(photoPose(1, 2, 5)).toBe(0);
  expect(photoPose(3, 4, 5)).toBe(2);
});

test('without a known shutter the robot pose is used, as before', () => {
  expect(photoPose(null, 2, 5)).toBe(1);
  expect(photoPose(null, undefined, 5)).toBeUndefined();
});

test('the pose stays inside the plan', () => {
  expect(photoPose(9, undefined, 5)).toBe(4);
  expect(photoPose(null, 0, 5)).toBeUndefined();
});
