import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import PwaRegistration from '@/components/pwa/PwaRegistration';

const geist = Geist({ subsets: ['latin'] });

// ─── PWA + SEO metadata ────────────────────────────────────────
export const metadata: Metadata = {
  title: 'SafeDoc — ניהול מסמכי בטיחות',
  description: 'מערכת לניהול מסמכי בטיחות של עובדים באתר בנייה — נתן ולדמן ובניו בע"מ',
  manifest: '/manifest.json',

  // iOS PWA
  appleWebApp: {
    capable: true,
    title: 'SafeDoc',
    statusBarStyle: 'default',
  },

  // Icons
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
    shortcut: '/icons/icon-192.png',
  },

  // Prevent indexing (internal business tool)
  robots: { index: false, follow: false },
};

// ─── Viewport / theme color (separate from metadata in Next 14+) ──
export const viewport: Viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <head>
        {/* iOS home screen / splash */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SafeDoc" />

        {/* Apple touch icons (fallback for older iOS) */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      </head>
      <body className={`${geist.className} bg-gray-50 min-h-screen`}>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
