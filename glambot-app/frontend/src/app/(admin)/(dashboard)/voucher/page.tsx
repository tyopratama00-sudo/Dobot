import { Metadata } from 'next';
import { VoucherPage } from '@/features/admin/voucher/pages/VoucherPage';

export const metadata: Metadata = {
  title: 'Manage Voucher',
};

export default function VoucherRoute() {
  return <VoucherPage />;
}
