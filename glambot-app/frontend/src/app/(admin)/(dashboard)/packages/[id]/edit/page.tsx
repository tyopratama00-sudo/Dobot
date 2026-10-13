import { Metadata } from 'next';
import { PackageEditPage } from '@/features/admin/packages/pages/PackageEditPage';

export const metadata: Metadata = {
  title: 'Edit Package',
};

export default async function PackageEditRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PackageEditPage id={Number(id)} />;
}
