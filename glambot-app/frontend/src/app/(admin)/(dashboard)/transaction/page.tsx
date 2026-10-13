import { Metadata } from 'next';
import { TransactionPage } from '@/features/admin/transaction/pages/TransactionPage';

export const metadata: Metadata = {
  title: 'Transactions',
};

export default function TransactionRoute() {
  return <TransactionPage />;
}
