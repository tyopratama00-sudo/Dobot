'use client';

import { useRouter } from 'next/navigation';
import { NotFoundState } from '@/components/admin/shared/NotFoundState';

export default function AdminNotFound() {
  const router = useRouter();

  return (
    <NotFoundState
      title="Page not found"
      description="The URL you opened is unavailable, or this page has been moved."
      backLabel="Back to Dashboard"
      onBack={() => router.push('/dashboard')}
    />
  );
}
