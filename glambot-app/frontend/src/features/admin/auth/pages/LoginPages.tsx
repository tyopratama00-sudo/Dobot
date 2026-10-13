'use client';

import { Sparkles } from 'lucide-react';
import { LoginForm } from '../components/LoginForm';

// Glambot brand gradient (navy → blue), mirrors the public `gradient-text` utility.
const brandGradient = {
  backgroundImage:
    'linear-gradient(to bottom right, #112d4e 0%, #163a64 19%, #2768b4 70%, #3f72af 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
} as const;

export default function LoginPage() {
  return (
    <main className="font-grotesk relative min-h-screen w-full overflow-hidden bg-[url('/bg.webp')] bg-cover bg-center bg-fixed">
      {/* Soft Glambot glow accents */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-96 w-96 rounded-full bg-[#3F72AF]/30 blur-[140px]" />
        <div className="absolute top-1/4 -right-32 h-[26rem] w-[26rem] rounded-full bg-[#ACD5FF]/40 blur-[150px]" />
        <div className="absolute -bottom-48 left-1/4 h-[28rem] w-[28rem] rounded-full bg-[#112D4E]/20 blur-[150px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-10 lg:flex-row lg:justify-between lg:gap-12 lg:px-12 xl:px-20">
        {/* Branding */}
        <div className="flex max-w-xl flex-col items-center text-center lg:items-start lg:text-left">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/robot 1.svg"
              alt="Glambot"
              className="h-16 w-16 drop-shadow-[0_8px_24px_rgba(17,45,78,0.25)] md:h-20 md:w-20"
            />
            <span
              className="text-5xl font-normal tracking-tight md:text-6xl xl:text-7xl"
              style={{ ...brandGradient, fontFamily: 'var(--font-changa-one)' }}
            >
              Glambot
            </span>
          </div>

          <div className="relative mt-8">
            <Sparkles
              className="absolute -top-6 -left-7 hidden size-7 text-[#3F72AF] lg:block"
              strokeWidth={1.5}
              fill="currentColor"
            />
            <h2
              className="text-3xl leading-tight font-semibold md:text-4xl xl:text-[44px]"
              style={brandGradient}
            >
              Snap. Pose. Glam.
            </h2>
          </div>

          <p className="mt-4 max-w-md text-base leading-relaxed text-[#112D4E]/70 md:text-lg">
            Automatic pose sequence photobooth. Sign in to manage your
            Glambot booth — frames, vouchers, devices, and more.
          </p>
        </div>

        {/* Login Form */}
        <LoginForm />
      </div>
    </main>
  );
}
