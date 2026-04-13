'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getClientRole } from '@/lib/auth/client';

function IconWorkers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconTruck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
      <rect x="9" y="11" width="14" height="10" rx="2"/>
      <circle cx="12" cy="21" r="1"/>
      <circle cx="20" cy="21" r="1"/>
    </svg>
  );
}

function IconLift() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5"/>
      <path d="m5 12 7-7 7 7"/>
      <path d="M5 19h14"/>
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/>
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
      <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  );
}

const CARDS = [
  {
    href: '/workers',
    icon: IconWorkers,
    title: 'עובדים',
    description: 'ניהול תיקי עובדים, מסמכי זהות, תדריכי בטיחות ואישורי עבודה בגובה',
    color: 'text-orange-500',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
    hoverBorder: 'hover:border-orange-300',
  },
  {
    href: '/heavy-equipment',
    icon: IconTruck,
    title: 'כלי צמ"ה',
    description: 'ניהול רישיונות, ביטוחים ובדיקות תקופתיות לכלי צמ"ה',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    hoverBorder: 'hover:border-blue-300',
  },
  {
    href: '/lifting-equipment',
    icon: IconLift,
    title: 'ציוד הרמה',
    description: 'מעקב אחר ציוד הרמה ותוקף בדיקות תקופתיות',
    color: 'text-purple-500',
    bg: 'bg-purple-50',
    border: 'border-purple-100',
    hoverBorder: 'hover:border-purple-300',
  },
  {
    href: '/subcontractors',
    icon: IconBuilding,
    title: 'קבלני משנה',
    description: 'ניהול קבלני משנה ואנשי קשר',
    color: 'text-green-500',
    bg: 'bg-green-50',
    border: 'border-green-100',
    hoverBorder: 'hover:border-green-300',
  },
];

export default function DashboardPage() {
  const [role, setRole] = useState<'admin' | 'viewer' | null>(null);

  useEffect(() => {
    setRole(getClientRole());
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10" dir="rtl">
      {/* Hero */}
      <div className="mb-10">
        <span className="text-xs font-medium text-orange-500 bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-100">
          {role === 'viewer' ? 'צפייה בלבד' : 'ניהול'}
        </span>
        <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-2">SafeDoc</h1>
        <p className="text-base font-semibold text-gray-700 mb-1.5">
          מערכת לניהול מסמכי בטיחות לעובדים וכלים
        </p>
        <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
          המערכת מאפשרת ניהול, מעקב ובקרה על מסמכי בטיחות, תדריכים ותוקף אישורים לעובדים, כלי צמ&quot;ה וציוד הרמה.
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {CARDS.map(({ href, icon: Icon, title, description, color, bg, border, hoverBorder }) => (
          <Link
            key={href}
            href={href}
            className={`group flex flex-col rounded-2xl border ${border} ${hoverBorder} bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200`}
          >
            {/* אייקון */}
            <div className={`${bg} ${color} w-10 h-10 rounded-xl flex items-center justify-center mb-4 shrink-0`}>
              <Icon />
            </div>

            {/* תוכן */}
            <p className="font-semibold text-gray-900 text-sm mb-1.5">{title}</p>
            <p className="text-xs text-gray-500 leading-relaxed flex-1">{description}</p>

            {/* חץ */}
            <div className={`flex items-center gap-1 mt-4 text-xs font-medium ${color} opacity-0 group-hover:opacity-100 transition-opacity`}>
              <span>כניסה</span>
              <IconChevronLeft />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
