'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ADMIN_NAV = [
  { href: '/admin/users', label: 'משתמשים', prefix: '/admin/users' },
  { href: '/admin/companies', label: 'חברות', prefix: '/admin/companies' },
];

export default function AdminSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 mb-6 border-b border-gray-200 pb-0">
      {ADMIN_NAV.map(({ href, label, prefix }) => {
        const active = pathname.startsWith(prefix);
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              active
                ? 'border-orange-500 text-orange-600 bg-orange-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
