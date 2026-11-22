import type { Metadata, Viewport } from 'next';
import { Vazirmatn, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AppProvider } from '@/components/AppProvider';

const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-vazirmatn',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DeutschKart | گنجینه فلش‌کارت هوشمند آلمانی',
  description:
    'یادگیری و حفظ لغات آلمانی (A1 تا B2) با فلش‌کارت‌های سوایپ، آزمون آرتیکل و معنی، و ساخت خودکار کارت از متن و عکس با هوش مصنوعی',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DeutschKart',
  },
};

export const viewport: Viewport = {
  themeColor: '#22c55e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} ${jakarta.variable}`}>
      <body className="min-h-screen antialiased selection:bg-emerald-200 selection:text-emerald-900">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
