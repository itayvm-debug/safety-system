'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Issue, IssueStatus } from '@/lib/documents/issues';

const ENTITY_LABELS: Record<Issue['entityType'], string> = {
  worker: 'עובד',
  vehicle: 'רכב',
  heavy_equipment: 'כלי צמ"ה',
  lifting_equipment: 'ציוד הרמה',
};

const STATUS_LABELS: Record<IssueStatus, string> = {
  expired: 'פג תוקף',
  missing: 'חסר',
  expiring_soon: 'עומד לפוג',
};

const STATUS_COLORS: Record<IssueStatus, { row: string; badge: string; dot: string }> = {
  expired: { row: 'border-r-red-500', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  missing: { row: 'border-r-red-500', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  expiring_soon: { row: 'border-r-yellow-400', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
};

interface Props {
  issues: Issue[];
  initialStatus?: string;
}

export default function IssuesList({ issues, initialStatus }: Props) {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState<string>('all');
  const [status, setStatus] = useState<string>(
    initialStatus === 'urgent' ? 'urgent' : initialStatus === 'expiring' ? 'expiring_soon' : 'all'
  );
  const [subcontractor, setSubcontractor] = useState<string>('all');
  const [manager, setManager] = useState<string>('all');

  // Build unique filter options from data
  const subcontractors = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues) {
      if (i.subcontractorId && i.subcontractorName) map.set(i.subcontractorId, i.subcontractorName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [issues]);

  const managers = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues) {
      if (i.managerId && i.managerName) map.set(i.managerId, i.managerName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [issues]);

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      if (entityType !== 'all') {
        if (entityType === 'manager') {
          if (i.entityType !== 'worker' || !i.isManager) return false;
        } else {
          if (i.entityType !== entityType) return false;
        }
      }
      if (status === 'urgent' && i.status === 'expiring_soon') return false;
      if (status === 'expiring_soon' && i.status !== 'expiring_soon') return false;
      if (subcontractor !== 'all' && i.subcontractorId !== subcontractor) return false;
      if (manager !== 'all' && i.managerId !== manager) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [i.entityName, i.problem, i.subcontractorName, i.managerName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [issues, search, entityType, status, subcontractor, manager]);

  const urgentCount = filtered.filter((i) => i.status !== 'expiring_soon').length;
  const expiringCount = filtered.filter((i) => i.status === 'expiring_soon').length;

  // Sort: expired/missing first, then expiring_soon
  const sorted = [...filtered].sort((a, b) => {
    const sev = { expired: 3, missing: 3, expiring_soon: 1 };
    return sev[b.status] - sev[a.status];
  });

  return (
    <div className="space-y-5">

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
        <div className="relative">
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, סוג בעיה..."
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Entity type */}
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="all">כל הסוגים</option>
            <option value="worker">עובדים</option>
            <option value="manager">מנהלי עבודה</option>
            <option value="vehicle">רכבים</option>
            <option value="heavy_equipment">כלי צמ"ה</option>
            <option value="lifting_equipment">ציוד הרמה</option>
          </select>

          {/* Status */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="urgent">לא תקין (חסר / פג תוקף)</option>
            <option value="expiring_soon">עומד לפוג</option>
          </select>

          {/* Subcontractor */}
          {subcontractors.length > 0 && (
            <select
              value={subcontractor}
              onChange={(e) => setSubcontractor(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="all">כל קבלני המשנה</option>
              {subcontractors.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}

          {/* Manager */}
          {managers.length > 0 && (
            <select
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="all">כל מנהלי העבודה</option>
              {managers.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}

          {/* Reset */}
          {(search || entityType !== 'all' || status !== 'all' || subcontractor !== 'all' || manager !== 'all') && (
            <button
              onClick={() => { setSearch(''); setEntityType('all'); setStatus('all'); setSubcontractor('all'); setManager('all'); }}
              className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              נקה פילטרים
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-500">{sorted.length} פריטים</span>
        {urgentCount > 0 && <span className="text-red-600 font-medium">{urgentCount} לא תקינים</span>}
        {expiringCount > 0 && <span className="text-orange-600 font-medium">{expiringCount} עומדים לפוג</span>}
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-base font-medium">
            {search || entityType !== 'all' || status !== 'all' ? 'לא נמצאו פריטים התואמים לפילטר' : 'אין ליקויים פתוחים'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const colors = STATUS_COLORS[issue.status];
  const entityLabel = issue.entityType === 'worker' && issue.isManager ? 'מנהל עבודה' : ENTITY_LABELS[issue.entityType];

  return (
    <div className={`bg-white border border-gray-100 border-r-4 ${colors.row} rounded-xl px-4 py-3.5 flex items-center justify-between gap-4`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium shrink-0">
            {entityLabel}
          </span>
          <span className="font-semibold text-gray-900 text-sm truncate">{issue.entityName}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${colors.badge}`}>
            {STATUS_LABELS[issue.status]}
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-1.5">{issue.problem}</p>
        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
          {issue.subcontractorName && (
            <span>קבלן: {issue.subcontractorName}</span>
          )}
          {issue.managerName && (
            <span>מנהל: {issue.managerName}</span>
          )}
        </div>
      </div>
      <Link
        href={issue.href}
        className="shrink-0 text-xs font-medium text-orange-500 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
      >
        פתח ←
      </Link>
    </div>
  );
}
