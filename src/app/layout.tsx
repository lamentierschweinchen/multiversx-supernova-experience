import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

const spaceMono = Space_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: '600ms: Enter the Supernova',
  description:
    'Every 600 milliseconds, a new block. Every block, a new universe. Feel the rhythm of MultiversX in an interactive experience.',
  openGraph: {
    title: '600ms: Enter the Supernova',
    description:
      'Feel the rhythm of MultiversX blocks. Tap in sync, create unique constellations from real blockchain data.',
    type: 'website',
    siteName: '600ms Supernova',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '600ms: Enter the Supernova — MultiversX interactive experience',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '600ms: Enter the Supernova',
    description:
      'Feel the rhythm of MultiversX blocks. Tap in sync, create unique constellations from real blockchain data.',
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${spaceMono.variable}`}
    >
      <body
        style={{
          height: '100vh',
          overflow: 'hidden',
          background: '#000',
          color: '#fff',
          margin: 0,
        }}
      >
        {children}
      </body>
    </html>
  );
}
