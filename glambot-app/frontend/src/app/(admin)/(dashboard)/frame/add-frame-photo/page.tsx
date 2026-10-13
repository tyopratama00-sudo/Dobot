import { Metadata } from 'next';
import { FrameAddPage } from '@/features/admin/frame/pages/FrameCreatePage';

export const metadata: Metadata = {
  title: 'Add Frame',
};

export default function FrameAddRoute() {
  return <FrameAddPage />;
}
