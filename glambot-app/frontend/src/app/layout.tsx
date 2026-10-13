import type { Metadata } from 'next';
import {
  Space_Grotesk,
  Changa_One,
  Inter,
  Public_Sans,
} from 'next/font/google';
import { Providers } from './providers';

// Public (Glambot) fonts
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

const changaOne = Changa_One({
  weight: '400',
  variable: '--font-changa-one',
  subsets: ['latin'],
});

// Admin fonts
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Glambot',
    template: '%s | Glambot',
  },
  description: 'The camera moves through 10 poses and follows your face',
  icons: {
    icon: '/robot%201.svg',
    shortcut: '/robot%201.svg',
    apple: '/robot%201.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${changaOne.variable} ${inter.variable} ${publicSans.variable} h-full antialiased`}
    >
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
