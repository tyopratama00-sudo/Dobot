import { Metadata } from 'next';
import { PackagePage } from '@/features/admin/packages/pages/PackagePage';

export const metadata: Metadata = {
  title: 'Manage Packages',
};

export default function PackagesRoute() {
  return <PackagePage />;
}
