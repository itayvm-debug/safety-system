import Link from 'next/link';
import { LEGAL } from '@/lib/legal/config';
import { SYSTEM_VERSION } from '@/lib/system/version';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-gray-100 bg-white">
      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
        <p>© {year} {LEGAL.companyName} · v{SYSTEM_VERSION}</p>
        <nav aria-label="קישורי מידע משפטי" className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
          <Link href="/terms" className="text-gray-600 hover:underline transition-colors">תנאי שימוש</Link>
          <Link href="/privacy" className="text-gray-600 hover:underline transition-colors">פרטיות</Link>
          <Link href="/accessibility" className="text-gray-600 hover:underline transition-colors">נגישות</Link>
          <Link href="/about" className="text-gray-600 hover:underline transition-colors">אודות</Link>
        </nav>
      </div>
    </footer>
  );
}
