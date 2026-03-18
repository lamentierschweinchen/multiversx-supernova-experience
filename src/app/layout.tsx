import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '600ms: Enter the Supernova',
  description:
    'A blockchain that finalizes in 600 milliseconds. Feel the rhythm of MultiversX blocks in an interactive experience.',
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
      className={`${geistSans.variable} ${geistMono.variable}`}
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
