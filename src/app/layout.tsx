import type { Metadata, Viewport } from 'next';
import { Orbitron, Exo_2, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const orbitron = Orbitron({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
});

const exo2 = Exo_2({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: '600ms — Feel the Supernova',
  description:
    'The universe expands. Block by block. Every 600 milliseconds. Match the rhythm of MultiversX Supernova and create a constellation that is yours alone.',
  openGraph: {
    title: '600ms — Feel the Supernova',
    description:
      'Sync your rhythm to a live network. Create a constellation that only exists once. An interactive experience by MultiversX.',
    type: 'website',
    siteName: '600ms',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '600ms — Feel the Supernova',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '600ms — Feel the Supernova',
    description:
      'Sync your rhythm to a live network. Create a constellation that only exists once. An interactive experience by MultiversX.',
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
      className={`${orbitron.variable} ${exo2.variable} ${jetbrainsMono.variable}`}
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
