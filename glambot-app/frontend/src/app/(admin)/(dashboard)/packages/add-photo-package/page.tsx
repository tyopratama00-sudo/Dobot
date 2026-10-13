import { Metadata } from 'next';
import { PackageCreatePage } from '@/features/admin/packages/pages/PackageCreatePage';

export const metadata: Metadata = {
  title: 'Create Package',
};

export default function PackageCreateRoute() {
  return <PackageCreatePage />;
}
