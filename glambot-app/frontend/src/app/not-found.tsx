import '@/styles/public.css';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import GlassCard from '@/components/shared/GlassCard';

export default function NotFound() {
  return (
    <div className="font-grotesk h-full bg-[url('/bg.webp')] bg-cover bg-center bg-fixed">
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <GlassCard className="p-10 flex flex-col items-center text-center">
          <h1 className="text-8xl font-bold text-white/20 mb-4">404</h1>
          <h2 className="text-2xl font-bold text-white mb-2">Page Not Found</h2>
          <p className="text-white/60 text-base mb-8">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button asChild className="w-full">
            <Link href="/">Back to Home</Link>
          </Button>
        </GlassCard>
      </main>
    </div>
  );
}
