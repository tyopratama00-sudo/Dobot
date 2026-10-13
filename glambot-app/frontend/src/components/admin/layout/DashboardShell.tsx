'use client';

import { AppSidebar } from '@/components/admin/layout/AppSidebar';
import { DashboardHeader } from '@/components/admin/layout/DashboardHeader';
import { SidebarInset, SidebarProvider } from '@/components/admin/ui/sidebar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-[url('/bg.webp')] bg-cover bg-center bg-fixed">
        <DashboardHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
