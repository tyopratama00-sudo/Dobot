/**
 * Pose (0-based) a new photo belongs to: the pose whose countdown fired the shutter.
 * The camera can take seconds to deliver, and the robot may already be at the next
 * pose by then (always so in --no-robot mode), so its current index would shift every
 * photo one pose later. Indices are the robot's 1-based sequence positions.
 */
export function photoPose(shutterIndex: number | null, robotIndex: number | undefined, total: number): number | undefined {
  const index = shutterIndex !== null && shutterIndex > 0 ? shutterIndex : robotIndex;
  return index ? Math.max(0, Math.min(total - 1, index - 1)) : undefined;
}
