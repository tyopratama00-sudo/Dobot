import { useLottie } from 'lottie-react';
import loadingAnimation from '@/assets/loading.json';
import successAnimation from '@/assets/success.json';
import failedAnimation from '@/assets/Failed.json';

export type ActionStatus =
  | 'waiting'
  | 'processing'
  | 'success'
  | 'failed'
  | 'expired';

interface StatusAnimationProps {
  status: ActionStatus;
  className?: string;
}

export function StatusAnimation({
  status,
  className = 'w-37.5 h-37.5',
}: StatusAnimationProps) {
  const animationMap: Record<ActionStatus, unknown> = {
    waiting: loadingAnimation,
    processing: loadingAnimation,
    success: successAnimation,
    failed: failedAnimation,
    expired: failedAnimation,
  };

  const { View } = useLottie({
    animationData: animationMap[status],
    loop: status !== 'success',
  });

  return <div className={className}>{View}</div>;
}
