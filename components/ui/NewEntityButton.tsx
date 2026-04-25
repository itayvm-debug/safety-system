'use client';

import Link from 'next/link';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function NewEntityButton({ href, label }: { href: string; label: string }) {
  const isOnline = useOnlineStatus();
  if (!isOnline) return null;
  return (
    <Link
      href={href}
      className="bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors shrink-0"
    >
      {label}
    </Link>
  );
}
