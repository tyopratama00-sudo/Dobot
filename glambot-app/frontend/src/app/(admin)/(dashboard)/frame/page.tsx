import { Metadata } from 'next';
import { FramePage } from '@/features/admin/frame/pages/FramePage';

export const metadata: Metadata = {
  title: 'Setup Frame',
};

export default function FrameRoute() {
  return <FramePage />;
}
