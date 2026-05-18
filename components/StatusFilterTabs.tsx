'use client';

export type StatusFilter = 'all' | 'expired' | 'expiring_soon' | 'valid';

export interface StatusCounts {
  all: number;
  invalid: number;  // expired + missing
  expiring: number;
  valid: number;    // valid + not_required
}

interface Props {
  filter: StatusFilter;
  counts: StatusCounts;
  onChange: (v: StatusFilter) => void;
}

const BUTTONS: { label: string; value: StatusFilter; activeClass: string }[] = [
  { label: 'הכל',        value: 'all',          activeClass: 'bg-gray-800 text-white border-gray-800'   },
  { label: 'לא תקין',   value: 'expired',      activeClass: 'bg-red-600 text-white border-red-600'     },
  { label: 'עומד לפוג', value: 'expiring_soon', activeClass: 'bg-yellow-500 text-white border-yellow-500' },
  { label: 'תקין',       value: 'valid',        activeClass: 'bg-green-600 text-white border-green-600' },
];

function countFor(btn: StatusFilter, counts: StatusCounts): number {
  if (btn === 'all') return counts.all;
  if (btn === 'expired') return counts.invalid;
  if (btn === 'expiring_soon') return counts.expiring;
  return counts.valid;
}

export default function StatusFilterTabs({ filter, counts, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {BUTTONS.map((btn) => (
        <button
          key={btn.value}
          onClick={() => onChange(filter === btn.value ? 'all' : btn.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
            filter === btn.value
              ? btn.activeClass
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          {btn.label}
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
            filter === btn.value ? 'bg-white/20' : 'bg-gray-100 text-gray-500'
          }`}>
            {countFor(btn.value, counts)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** חישוב מונים — פונקציה גנרית לשימוש בכל רשימה */
export function computeStatusCounts<T>(
  items: T[],
  getStatus: (item: T) => string
): StatusCounts {
  let invalid = 0, expiring = 0, valid = 0;
  for (const item of items) {
    const s = getStatus(item);
    if (s === 'expired' || s === 'missing') invalid++;
    else if (s === 'expiring_soon') expiring++;
    else valid++;
  }
  return { all: items.length, invalid, expiring, valid };
}

/** הוראות סינון — עקביות עם WorkerList */
export function matchesStatusFilter<T>(
  item: T,
  filter: StatusFilter,
  getStatus: (item: T) => string
): boolean {
  if (filter === 'all') return true;
  const s = getStatus(item);
  if (filter === 'expired') return s === 'expired' || s === 'missing';
  return s === filter;
}
