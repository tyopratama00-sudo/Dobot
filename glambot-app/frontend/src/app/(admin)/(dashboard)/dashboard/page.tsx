import { Metadata } from 'next';
import { DashboardPage } from '@/features/admin/dashboard/pages/DashboardPage';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function DashboardRoute() {
  return <DashboardPage />;
}
