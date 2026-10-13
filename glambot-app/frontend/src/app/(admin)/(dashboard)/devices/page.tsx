import { Metadata } from 'next';
import { DevicesPage } from '@/features/admin/devices/pages/DevicesPage';

export const metadata: Metadata = {
  title: 'Devices',
};

export default function DevicesRoute() {
  return <DevicesPage />;
}
