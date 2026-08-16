import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import PwaRegistration from '@/components/pwa/PwaRegistration';
import OfflineBanner from '@/components/offline/OfflineBanner';
import SiteFooter from '@/components/SiteFooter';
import { SessionCompaniesProvider } from '@/lib/session/SessionCompaniesProvider';

const geist = Geist({ subsets: ['latin'] });

// Absolute base URL — used for OG image so crawlers get a fully-qualified URL.
// Falls back to the production Vercel deployment when NEXT_PUBLIC_APP_URL is unset.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://safety-system-henna.vercel.app';

// ─── PWA + SEO + Open Graph metadata ──────────────────────────
export const metadata: Metadata = {
  title: 'SafeDoc — ניהול מסמכי בטיחות',
  description: 'מערכת SafeDoc לניהול מסמכי בטיחות ורישיונות עובדים באתרי הבנייה',
  manifest: '/manifest.json',

  // Open Graph — controls WhatsApp / Telegram / Facebook link previews
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'SafeDoc',
    title: 'SafeDoc — ניהול מסמכי בטיחות',
    description: 'מערכת SafeDoc לניהול מסמכי בטיחות ורישיונות עובדים באתרי הבנייה',
    images: [
      {
        url: `${APP_URL}/icons/icon-512.png`,
        width: 512,
        height: 512,
        alt: 'SafeDoc',
      },
    ],
  },

  // Twitter / X card
  twitter: {
    card: 'summary',
    title: 'SafeDoc — ניהול מסמכי בטיחות',
    description: 'מערכת SafeDoc לניהול מסמכי בטיחות ורישיונות עובדים באתרי הבנייה',
    images: [`${APP_URL}/icons/icon-512.png`],
  },

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
      <body className={`${geist.className} bg-gray-50 min-h-screen flex flex-col`}>
        <SessionCompaniesProvider>
          <div className="flex-1">
            {children}
          </div>
          <SiteFooter />
          <PwaRegistration />
          <OfflineBanner />
        </SessionCompaniesProvider>
      </body>
    </html>
  );
}
