import { DashboardShell } from '@/components/admin/layout/DashboardShell';
import { ErrorBoundary } from '@/components/admin/ErrorBoundary';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell>
      <ErrorBoundary>{children}</ErrorBoundary>
    </DashboardShell>
  );
}
