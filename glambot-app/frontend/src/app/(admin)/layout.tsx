import '@/styles/admin.css';
import { Toaster } from '@/components/admin/ui/sonner';

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="font-sans bg-background text-foreground min-h-full">
      <Toaster />
      {children}
    </div>
  );
}

export const dynamic = 'force-dynamic';
