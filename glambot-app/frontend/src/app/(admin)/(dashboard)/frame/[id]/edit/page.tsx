import { Metadata } from 'next';
import { FrameEditPage } from '@/features/admin/frame/pages/FrameEditPage';

export const metadata: Metadata = {
  title: 'Edit Frame',
};

export default async function FrameEditRoute({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <FrameEditPage id={resolvedParams.id} />;
}
