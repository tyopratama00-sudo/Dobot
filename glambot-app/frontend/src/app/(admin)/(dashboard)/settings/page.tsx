import { Metadata } from 'next';
import { SettingsPage } from '@/features/admin/settings/pages/SettingsPage';

export const metadata: Metadata = {
  title: 'Settings',
};

export default function SettingsRoute() {
  return <SettingsPage />;
}
