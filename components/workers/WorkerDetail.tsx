'use client';

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  WorkerWithDocuments,
  Document,
  DocumentType,
  Subcontractor,
  ALL_DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
} from '@/types';
import { getWorkerIdentifierLabel, getWorkerIdentifierValue } from '@/lib/workers/identifier';
import { getDocumentStatus, getWorkerStatus } from '@/lib/documents/status';
import { buildWorkerIssues, Issue } from '@/lib/documents/issues';
import StatusBadge from '@/components/StatusBadge';
import SafetyBriefingCard from '@/components/workers/SafetyBriefingCard';
import HeightBanCard from '@/components/workers/HeightBanCard';
import LiftingMachineAppointmentCard from '@/components/workers/LiftingMachineAppointmentCard';
import ProfessionalLicensesCard from '@/components/workers/ProfessionalLicensesCard';
import ManagerDocumentsCard from '@/components/workers/ManagerDocumentsCard';
import WorkerVehicleCard from '@/components/workers/WorkerVehicleCard';
import ToggleSwitch from '@/components/ToggleSwitch';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface WorkerDetailProps {
  worker: WorkerWithDocuments;
}

// ─── Section accordion ─────────────────────────────────────────
function Section({
  title,
  children,
  defaultOpen = false,
  issueCount = 0,
  hint,
  headerAction,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  issueCount?: number;
  hint?: string;
  headerAction?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-right hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900">{title}</span>
          {issueCount > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
              {issueCount}
            </span>
          )}
          {hint && <span className="text-xs text-gray-400 font-normal">{hint}</span>}
        </div>
        <div className="flex items-center gap-3">
          {headerAction && (
            <div onClick={(e) => e.stopPropagation()}>{headerAction}</div>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-2 border-t border-gray-100">{children}</div>
      )}
    </div>
  );
}

// ─── כרטיס סיכום בעיות ────────────────────────────────────────
function WorkerSummaryBanner({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  const urgent = issues.filter((i) => i.status !== 'expiring_soon');
  const expiring = issues.filter((i) => i.status === 'expiring_soon');

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-red-700 mb-2">דורש טיפול</p>
      <ul className="space-y-1.5">
        {urgent.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-red-700">{i.problem}</span>
          </li>
        ))}
        {expiring.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
            <span className="text-orange-700">{i.problem} — עומד לפוג</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WorkerDetail({ worker }: WorkerDetailProps) {
  const router = useRouter();
  const [deletingWorker, setDeletingWorker] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [togglingActive, setTogglingActive] = useState(false);
  const [togglingCraneOp, setTogglingCraneOp] = useState(false);
  const [togglingManager, setTogglingManager] = useState(false);
  const [isCraneOperator, setIsCraneOperator] = useState(!!worker.is_crane_operator);
  const [isResponsibleManager, setIsResponsibleManager] = useState(!!worker.is_responsible_site_manager);
  const [localManagerId, setLocalManagerId] = useState<string | null>(worker.responsible_manager_id ?? null);
  const [localAppointments, setLocalAppointments] = useState(worker.lifting_machine_appointments ?? []);

  const [pendingExpiry, setPendingExpiry] = useState<Map<string, string>>(new Map());
  const [localDocs, setLocalDocs] = useState<Document[]>(worker.documents);

  const overallStatus = getWorkerStatus(worker);

  const docMap = new Map<string, Document>(
    localDocs
      .filter((d) => d.doc_type !== 'optional_license')
      .map((d) => [d.doc_type, d])
  );

  const hasPending = pendingExpiry.size > 0;

  // חישוב בעיות לפי state מקומי נוכחי
  const workerWithLocalData = {
    ...worker,
    documents: localDocs,
    lifting_machine_appointments: localAppointments,
    is_crane_operator: isCraneOperator,
    is_responsible_site_manager: isResponsibleManager,
  } as WorkerWithDocuments;

  const workerIssues = buildWorkerIssues(workerWithLocalData);

  const docIssues = workerIssues.filter(
    (i) => !i.id.match(/-(height|briefing|crane|proflicense|manlicense|vehlicense|vehins)/)
  );
  const briefingIssues = workerIssues.filter((i) => i.id.includes('-briefing'));
  const heightIssues = workerIssues.filter((i) => i.id.includes('-height'));
  const licenseIssues = workerIssues.filter((i) => i.id.includes('-proflicense'));
  const craneIssues = workerIssues.filter((i) => i.id.includes('-crane'));
  const managerIssues = workerIssues.filter((i) =>
    i.id.match(/-(manlicense|vehlicense|vehins)/)
  );

  function handleExpiryChange(docType: string, value: string) {
    const savedValue = docMap.get(docType)?.expiry_date ?? '';
    setPendingExpiry((prev) => {
      const next = new Map(prev);
      if (value === savedValue) {
        next.delete(docType);
      } else {
        next.set(docType, value);
      }
      return next;
    });
  }

  async function handleSaveAll() {
    if (!hasPending) return;
    setSavingAll(true);
    setSaveError('');

    try {
      const promises = Array.from(pendingExpiry.entries()).map(([docType, expiry]) => {
        const doc = docMap.get(docType);
        return fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker_id: worker.id,
            doc_type: docType,
            file_url: doc?.file_url ?? null,
            expiry_date: expiry || null,
            is_required: doc?.is_required !== false,
          }),
        });
      });

      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.ok);

      if (failed.length > 0) {
        setSaveError('חלק מהשמירות נכשלו — נסה שוב');
        return;
      }

      router.push('/workers');
    } catch {
      setSaveError('שגיאת תקשורת');
    } finally {
      setSavingAll(false);
    }
  }

  async function handleDeleteWorker() {
    if (!confirm(`למחוק את ${worker.full_name}? פעולה זו בלתי הפיכה.`)) return;
    setDeletingWorker(true);
    const res = await fetch(`/api/workers/${worker.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/workers');
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body?.error || 'שגיאה במחיקה');
      setDeletingWorker(false);
    }
  }

  async function handleToggleActive() {
    setTogglingActive(true);
    try {
      await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !worker.is_active }),
      });
      router.refresh();
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleToggleCraneOperator() {
    setTogglingCraneOp(true);
    try {
      const res = await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_crane_operator: !isCraneOperator }),
      });
      if (res.ok) setIsCraneOperator((prev) => !prev);
    } finally {
      setTogglingCraneOp(false);
    }
  }

  async function handleToggleResponsibleManager() {
    setTogglingManager(true);
    try {
      const res = await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_responsible_site_manager: !isResponsibleManager }),
      });
      if (res.ok) setIsResponsibleManager((prev) => !prev);
    } finally {
      setTogglingManager(false);
    }
  }

  return (
    <div className="space-y-3 pb-32">
      {/* כרטיס פרטים כלליים */}
      <div className={`bg-white rounded-xl border p-6 ${!worker.is_active ? 'border-gray-300 opacity-80' : 'border-gray-200'}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <PhotoUploader worker={worker} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{worker.full_name}</h1>
                {!worker.is_active && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">לא פעיל</span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {getWorkerIdentifierLabel(worker)}: {getWorkerIdentifierValue(worker)}
              </p>
              <p className="text-sm text-gray-500">{worker.is_foreign_worker ? 'עובד זר' : 'ישראלי'}</p>
              {worker.phone && <p className="text-sm text-gray-500" dir="ltr">{worker.phone}</p>}
              {worker.project_name && <p className="text-sm text-gray-400">פרויקט: {worker.project_name}</p>}
              <p className="text-xs text-gray-300 mt-1">
                עודכן: {format(parseISO(worker.updated_at), 'dd/MM/yyyy', { locale: he })}
              </p>
            </div>
          </div>
          <StatusBadge status={overallStatus} />
        </div>

        {worker.notes && (
          <div className="bg-gray-50 rounded-lg p-3 mt-2">
            <p className="text-sm text-gray-600">{worker.notes}</p>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <SubcontractorDisplay
            worker={worker}
            managerWorkerId={localManagerId}
            onChanged={() => router.refresh()}
          />
          {!isResponsibleManager && (
            <ManagerSelector
              worker={worker}
              onChanged={(newManagerId) => {
                setLocalManagerId(newManagerId);
                router.refresh();
              }}
            />
          )}
        </div>
      </div>

      {/* באנר סיכום בעיות */}
      <WorkerSummaryBanner issues={workerIssues} />

      {/* מסמכים */}
      <Section
        title="מסמכים"
        defaultOpen={docIssues.length > 0}
        issueCount={docIssues.length}
        hint={hasPending ? `· ${pendingExpiry.size} ממתין לשמירה` : undefined}
      >
        <div className="space-y-3">
          {ALL_DOCUMENT_TYPES.map((docType) => {
            if (docType === 'work_visa' && !worker.is_foreign_worker) return null;
            const doc = docMap.get(docType);
            const localExpiry = pendingExpiry.has(docType)
              ? pendingExpiry.get(docType)!
              : (doc?.expiry_date ?? '');
            const isPending = pendingExpiry.has(docType);

            return (
              <DocumentCard
                key={docType}
                workerId={worker.id}
                docType={docType}
                document={doc}
                localExpiry={localExpiry}
                isPending={isPending}
                onExpiryChange={(val) => handleExpiryChange(docType, val)}
                onFileUploaded={(newDoc: Document) => {
                  setLocalDocs((prev) => {
                    const idx = prev.findIndex((d) => d.doc_type === newDoc.doc_type && d.doc_type !== 'optional_license');
                    if (idx >= 0) { const next = [...prev]; next[idx] = newDoc; return next; }
                    return [...prev, newDoc];
                  });
                }}
                onDeleted={(docType: string) => {
                  setLocalDocs((prev) => prev.filter((d) => d.doc_type !== docType));
                }}
              />
            );
          })}
        </div>
      </Section>

      {/* תדריך בטיחות */}
      <Section
        title="תדריך בטיחות"
        defaultOpen={briefingIssues.length > 0}
        issueCount={briefingIssues.length}
      >
        <SafetyBriefingCard
          worker={worker}
          briefings={worker.safety_briefings ?? []}
        />
      </Section>

      {/* עבודה בגובה */}
      <Section
        title="עבודה בגובה"
        defaultOpen={heightIssues.length > 0}
        issueCount={heightIssues.length}
        hint="מספיק שאחד מהם תקין"
      >
        <HeightBanCard
          worker={worker}
          restrictions={worker.height_restrictions ?? []}
        />
      </Section>

      {/* רישיונות מקצועיים */}
      <Section
        title="רישיונות מקצועיים"
        defaultOpen={licenseIssues.length > 0}
        issueCount={licenseIssues.length}
      >
        <ProfessionalLicensesCard
          workerId={worker.id}
          licenses={worker.professional_licenses ?? []}
        />
      </Section>

      {/* מפעיל מכונת הרמה */}
      <Section
        title="מפעיל מכונת הרמה"
        defaultOpen={isCraneOperator && craneIssues.length > 0}
        issueCount={isCraneOperator ? craneIssues.length : 0}
        headerAction={
          <div className="flex items-center gap-2">
            <ToggleSwitch
              checked={isCraneOperator}
              onChange={handleToggleCraneOperator}
              disabled={togglingCraneOp}
            />
            <span className="text-sm text-gray-600">
              {togglingCraneOp ? '...' : isCraneOperator ? 'כן' : 'לא'}
            </span>
          </div>
        }
      >
        {isCraneOperator ? (
          <LiftingMachineAppointmentCard
            worker={worker}
            appointments={localAppointments}
            onAppointmentAdded={(appt) => setLocalAppointments((prev) => [appt, ...prev])}
            onAppointmentDeleted={(id) => setLocalAppointments((prev) => prev.filter((a) => a.id !== id))}
          />
        ) : (
          <p className="text-sm text-gray-400">העובד אינו מוגדר כמפעיל מכונת הרמה.</p>
        )}
      </Section>

      {/* מנהל עבודה */}
      <Section
        title="מנהל עבודה"
        defaultOpen={isResponsibleManager && managerIssues.length > 0}
        issueCount={isResponsibleManager ? managerIssues.length : 0}
        headerAction={
          <div className="flex items-center gap-2">
            <ToggleSwitch
              checked={isResponsibleManager}
              onChange={handleToggleResponsibleManager}
              disabled={togglingManager}
            />
            <span className="text-sm text-gray-600">
              {togglingManager ? '...' : isResponsibleManager ? 'כן' : 'לא'}
            </span>
          </div>
        }
      >
        {isResponsibleManager ? (
          <div className="space-y-4">
            <ManagerDocumentsCard
              workerId={worker.id}
              licenses={worker.manager_licenses ?? []}
            />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-700">רכב עבודה</h3>
                <span className="text-xs text-gray-400">נדרש רק אם מנהל העבודה נוהג ברכב חברה</span>
              </div>
              <WorkerVehicleCard
                workerId={worker.id}
                initialVehicles={worker.vehicles ?? []}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">העובד אינו מוגדר כמנהל עבודה אחראי.</p>
        )}
      </Section>

      {/* פעולות */}
      <Section title="פעולות" defaultOpen={false}>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href={`/workers/${worker.id}/edit`}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            עריכת פרטים
          </Link>
          <div className="flex items-center gap-2 px-1">
            <ToggleSwitch
              checked={!!worker.is_active}
              onChange={handleToggleActive}
              disabled={togglingActive}
            />
            <span className="text-sm text-gray-600">
              {togglingActive ? '...' : worker.is_active ? 'סמן כלא פעיל' : 'סמן כפעיל'}
            </span>
          </div>
          <button
            onClick={handleDeleteWorker}
            disabled={deletingWorker}
            className="px-4 py-2 text-sm border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deletingWorker ? 'מוחק...' : 'מחיקת עובד'}
          </button>
        </div>
      </Section>

      {/* כפתור שמירה גלובלי */}
      {(hasPending || saveError) && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 shadow-lg px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {saveError ? (
              <p className="text-sm text-red-600">{saveError}</p>
            ) : (
              <p className="text-sm text-gray-500">
                {pendingExpiry.size} שינוי{pendingExpiry.size !== 1 ? 'ים' : ''} ממתין{pendingExpiry.size !== 1 ? 'ים' : ''} לשמירה
              </p>
            )}
            <div className="flex gap-2 mr-auto">
              {hasPending && (
                <>
                  <button
                    onClick={() => { setPendingExpiry(new Map()); setSaveError(''); }}
                    className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600"
                  >
                    בטל שינויים
                  </button>
                  <button
                    onClick={handleSaveAll}
                    disabled={savingAll}
                    className="px-6 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                  >
                    {savingAll ? 'שומר...' : 'שמור שינויים'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── תצוגת קבלן משנה (עם נעילה לפי מנהל עבודה) ──────────────
function SubcontractorDisplay({
  worker,
  managerWorkerId,
  onChanged,
}: {
  worker: WorkerWithDocuments;
  managerWorkerId: string | null;
  onChanged: () => void;
}) {
  const [managerSub, setManagerSub] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [managerName, setManagerName] = useState('');

  useEffect(() => {
    if (!managerWorkerId) {
      setManagerSub(null);
      setManagerName('');
      return;
    }
    setManagerSub(undefined);
    fetch(`/api/workers/${managerWorkerId}`)
      .then((r) => r.json())
      .then((data) => {
        setManagerName(data.full_name ?? '');
        setManagerSub(data.subcontractor ?? null);
      })
      .catch(() => setManagerSub(null));
  }, [managerWorkerId]);

  if (managerWorkerId && managerSub === undefined) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 whitespace-nowrap">קבלן משנה:</span>
        <span className="text-sm text-gray-400">טוען...</span>
      </div>
    );
  }

  if (managerSub) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500 whitespace-nowrap">קבלן משנה:</span>
        <span className="text-sm font-medium text-blue-700">{managerSub.name}</span>
        <span className="text-xs bg-blue-50 text-blue-500 border border-blue-100 px-1.5 py-0.5 rounded whitespace-nowrap">
          דרך מנהל העבודה {managerName}
        </span>
      </div>
    );
  }

  return <SubcontractorSelector worker={worker} onChanged={onChanged} />;
}

// ─── בחירת קבלן משנה (עריכה חופשית) ─────────────────────────
function SubcontractorSelector({
  worker,
  onChanged,
}: {
  worker: WorkerWithDocuments;
  onChanged: () => void;
}) {
  const [subcontractors, setSubcontractors] = useState<Pick<Subcontractor, 'id' | 'name'>[]>([]);
  const [selectedId, setSelectedId] = useState<string>(worker.subcontractor_id ?? '');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  async function loadList() {
    if (loaded) return;
    try {
      const res = await fetch('/api/subcontractors');
      const data = await res.json();
      if (res.ok) setSubcontractors(data);
    } finally {
      setLoaded(true);
    }
  }

  async function handleChange(newId: string) {
    setSelectedId(newId);
    setSaving(true);
    try {
      await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcontractor_id: newId || null }),
      });
      onChanged();
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  const currentName =
    worker.subcontractor?.name ??
    subcontractors.find((s) => s.id === selectedId)?.name ??
    null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 whitespace-nowrap">קבלן משנה:</span>
      {open ? (
        <select
          autoFocus
          value={selectedId}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setOpen(false)}
          className="flex-1 border border-orange-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          <option value="">— ללא קבלן משנה —</option>
          {subcontractors.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      ) : (
        <button
          onClick={() => { setOpen(true); loadList(); }}
          className="text-sm text-gray-700 hover:text-orange-600 hover:underline"
        >
          {saving ? 'שומר...' : currentName ?? 'לחץ לשיוך'}
        </button>
      )}
    </div>
  );
}

// ─── שיוך מנהל עבודה ──────────────────────────────────────────
function ManagerSelector({
  worker,
  onChanged,
}: {
  worker: WorkerWithDocuments;
  onChanged: (newManagerId: string | null) => void;
}) {
  const [managers, setManagers] = useState<{ id: string; full_name: string; subcontractor_id: string | null }[]>([]);
  const [selectedId, setSelectedId] = useState<string>(worker.responsible_manager_id ?? '');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (worker.responsible_manager_id) loadList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadList() {
    if (loaded) return;
    try {
      const res = await fetch('/api/workers?managers=true');
      const data = await res.json();
      if (res.ok) setManagers(data);
    } finally {
      setLoaded(true);
    }
  }

  async function handleChange(newId: string) {
    setSelectedId(newId);
    setSaving(true);
    try {
      await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsible_manager_id: newId || null }),
      });

      if (newId) {
        const selectedManager = managers.find((m) => m.id === newId);
        if (selectedManager?.subcontractor_id) {
          await fetch(`/api/workers/${worker.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subcontractor_id: null }),
          });
        }
      }

      onChanged(newId || null);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  const currentName =
    managers.find((m) => m.id === selectedId)?.full_name ?? null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 whitespace-nowrap">מנהל עבודה:</span>
      {open ? (
        <select
          autoFocus
          value={selectedId}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setOpen(false)}
          className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">— ללא מנהל עבודה —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </select>
      ) : (
        <button
          onClick={() => { setOpen(true); loadList(); }}
          className="text-sm text-gray-700 hover:text-blue-600 hover:underline"
        >
          {saving ? 'שומר...' : currentName ?? (worker.responsible_manager_id && !loaded ? 'טוען...' : 'לחץ לשיוך')}
        </button>
      )}
    </div>
  );
}

// ─── תמונת עובד ───────────────────────────────────────────────
function PhotoUploader({ worker }: { worker: WorkerWithDocuments }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [uploading, setUploading] = useState(false);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!worker.photo_url) return;
    fetch(`/api/signed-url?path=${encodeURIComponent(worker.photo_url)}`)
      .then((r) => r.json())
      .then((d) => { if (d.url) setPhotoSrc(d.url); })
      .catch(() => {});
  }, [worker.photo_url]);

  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const rx = Math.min(canvas.width, canvas.height) * 0.34;
    const ry = rx * 1.28;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('מקם את פניך במסגרת', cx, cy + ry + 28);
  }, []);

  async function openCamera() {
    setCameraError('');
    setCapturedBlob(null);
    setCapturedPreview(null);
    setCameraOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          requestAnimationFrame(function loop() {
            if (!streamRef.current) return;
            drawOverlay();
            requestAnimationFrame(loop);
          });
        };
      }
    } catch {
      setCameraError('לא ניתן לגשת למצלמה. אנא בדוק הרשאות או השתמש בהעלאת קובץ.');
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCapturedBlob(null);
    setCapturedPreview(null);
    setCameraError('');
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 640, 640);

    canvas.toBlob((blob) => {
      if (!blob) return;
      setCapturedBlob(blob);
      setCapturedPreview(canvas.toDataURL('image/jpeg', 0.92));
    }, 'image/jpeg', 0.92);
  }

  async function uploadCapturedPhoto() {
    if (!capturedBlob) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', capturedBlob, `selfie_${Date.now()}.jpg`);
      formData.append('folder', 'photos');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) { setCameraError(uploadData.error ?? 'שגיאה בהעלאת תמונה'); return; }
      await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: uploadData.path }),
      });
      closeCamera();
      router.refresh();
    } catch { setCameraError('שגיאה בהעלאת תמונה'); } finally { setUploading(false); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'photos');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) { alert(uploadData.error ?? 'שגיאה בהעלאת תמונה'); return; }
      await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: uploadData.path }),
      });
      router.refresh();
    } catch { alert('שגיאה בהעלאת תמונה'); } finally { setUploading(false); }
  }

  return (
    <>
      <div className="relative w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt={worker.full_name}
            className="w-16 h-16 rounded-full object-cover cursor-pointer"
            onClick={() => setLightboxOpen(true)}
          />
        ) : (
          <span className="text-2xl font-bold text-orange-700">{worker.full_name.charAt(0)}</span>
        )}

        <button
          type="button"
          onClick={openCamera}
          disabled={uploading}
          className="absolute -bottom-1 -left-1 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 disabled:opacity-50"
          title="צלם תמונה"
        >
          {uploading ? (
            <span className="w-3 h-3 border border-orange-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="absolute -top-1 -left-1 w-5 h-5 bg-gray-100 border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-200 disabled:opacity-50"
          title="העלה מהגלריה"
        >
          <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black">
            <button onClick={closeCamera} className="text-white text-sm px-3 py-1.5 rounded-lg border border-white/30 hover:bg-white/10">
              ביטול
            </button>
            <span className="text-white font-medium text-sm">צילום עובד</span>
            <div className="w-16" />
          </div>

          <div className="flex-1 relative overflow-hidden">
            {capturedPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={capturedPreview} alt="preview" className="absolute inset-0 w-full h-full object-contain" />
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </>
            )}
          </div>

          {cameraError && (
            <div className="px-4 py-2 bg-red-900/80 text-red-200 text-sm text-center">{cameraError}</div>
          )}

          <div className="flex items-center justify-center gap-6 px-4 py-6 bg-black">
            {capturedPreview ? (
              <>
                <button
                  onClick={() => { setCapturedBlob(null); setCapturedPreview(null); }}
                  className="px-5 py-2.5 rounded-full border border-white/40 text-white text-sm hover:bg-white/10"
                >
                  צלם מחדש
                </button>
                <button
                  onClick={uploadCapturedPhoto}
                  disabled={uploading}
                  className="px-7 py-2.5 rounded-full bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 disabled:opacity-50"
                >
                  {uploading ? 'שומר...' : 'שמור תמונה'}
                </button>
              </>
            ) : (
              <button
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full bg-white border-4 border-orange-400 hover:bg-orange-50 transition-colors shadow-lg"
                aria-label="צלם"
              />
            )}
          </div>
        </div>
      )}

      {lightboxOpen && photoSrc && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoSrc}
            alt={worker.full_name}
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 left-4 text-white bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70"
            onClick={() => setLightboxOpen(false)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

// ─── כרטיס מסמך ───────────────────────────────────────────────
function DocumentCard({
  workerId,
  docType,
  document,
  localExpiry,
  isPending,
  onExpiryChange,
  onFileUploaded,
  onDeleted,
}: {
  workerId: string;
  docType: DocumentType;
  document: Document | undefined;
  localExpiry: string;
  isPending: boolean;
  onExpiryChange: (val: string) => void;
  onFileUploaded: (doc: Document) => void;
  onDeleted: (docType: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingRequired, setTogglingRequired] = useState(false);
  const [error, setError] = useState('');

  const isRequired = document?.is_required !== false;
  const statusFileUrl = document?.file_url ?? null;
  const statusExpiry = docType === 'id_document' ? null : localExpiry || null;
  const status = getDocumentStatus(statusFileUrl, statusExpiry, isRequired, docType !== 'id_document');

  const hasFile = !!document?.file_url;
  const showExpiry = docType !== 'id_document';

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setError(''); setUploadSuccess(false);
    try {
      const formData = new FormData();
      formData.append('file', file); formData.append('folder', 'documents');
      console.log('[upload:doc] starting', file.name, file.size, file.type);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      console.log('[upload:doc] status:', uploadRes.status, uploadRes.ok);
      const uploadData = await uploadRes.json().catch(e => { console.error('[upload:doc] json parse error:', e, 'content-type:', uploadRes.headers.get('content-type')); return {}; });
      if (!uploadRes.ok) { console.error('[upload:doc] server error:', uploadRes.status, uploadData); setError(uploadData.error ?? 'שגיאה בהעלאה'); return; }

      const docRes = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: workerId,
          doc_type: docType,
          file_url: uploadData.path,
          expiry_date: localExpiry || null,
          is_required: isRequired,
        }),
      });
      const docData = await docRes.json();
      if (!docRes.ok) { setError(docData.error ?? 'שגיאה בשמירה'); return; }

      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
      onFileUploaded(docData);
    } catch (err) { console.error('[upload:doc] fetch error:', err); setError('שגיאה בהעלאה'); } finally { setUploading(false); }
  }

  async function handleDeleteDocument() {
    if (!document?.id) return;
    if (!confirm('למחוק את המסמך? הקובץ יימחק לצמיתות.')) return;
    setDeleting(true); setError('');
    try {
      const res = await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_id: document.id }),
      });
      if (!res.ok) { setError('שגיאה במחיקה'); return; }
      onDeleted(docType);
    } catch { setError('שגיאה במחיקה'); } finally { setDeleting(false); }
  }

  async function handleToggleRequired() {
    setTogglingRequired(true); setError('');
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: workerId,
          doc_type: docType,
          file_url: document?.file_url ?? null,
          expiry_date: document?.expiry_date ?? null,
          is_required: !isRequired,
        }),
      });
      const toggleData = await res.json();
      if (!res.ok) { setError(toggleData.error ?? 'שגיאה'); return; }
      onFileUploaded(toggleData);
    } catch { setError('שגיאה'); } finally { setTogglingRequired(false); }
  }

  async function handleViewDocument() {
    if (!document?.file_url) return;
    setOpening(true); setError('');
    try {
      const res = await fetch(`/api/signed-url?path=${encodeURIComponent(document.file_url)}`);
      const data = await res.json();
      if (!res.ok || !data.url) { setError('לא ניתן לפתוח את המסמך'); return; }
      window.open(data.url, '_blank');
    } catch { setError('שגיאה בפתיחת המסמך'); } finally { setOpening(false); }
  }

  return (
    <div className={`bg-white rounded-xl border p-4 transition-colors ${isPending ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'}`}>
      {/* כותרת + סטטוס */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium text-gray-900">
            {DOCUMENT_TYPE_LABELS[docType as Exclude<DocumentType, 'optional_license'>]}
          </h3>
          {isPending && (
            <span className="text-xs text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">ממתין לשמירה</span>
          )}
          {document?.updated_at && (
            <span className="text-xs text-gray-300">
              עודכן: {format(parseISO(document.updated_at), 'dd/MM/yy', { locale: he })}
            </span>
          )}
        </div>
        <StatusBadge status={status} size="sm" />
      </div>

      {/* תאריך תוקף */}
      {showExpiry && isRequired && (
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm text-gray-500 whitespace-nowrap">תוקף:</label>
          <input
            type="date"
            value={localExpiry}
            onChange={(e) => onExpiryChange(e.target.value)}
            className={`flex-1 px-2 py-1 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${
              isPending ? 'border-orange-300 bg-white' : 'border-gray-200'
            }`}
            dir="ltr"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {/* פעולות קובץ — סדר: צפה → העלה/החלף → מחק → לא נדרש */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasFile && (
          <button onClick={handleViewDocument} disabled={opening}
            className="flex items-center gap-1.5 text-sm text-orange-500 hover:text-orange-600 disabled:opacity-50">
            {opening ? <span className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /> :
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>}
            {opening ? 'פותח...' : 'צפה'}
          </button>
        )}

        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
          {uploading ? <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> :
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>}
          {uploading ? 'מעלה...' : hasFile ? 'החלף' : 'העלה'}
        </button>

        {hasFile && (
          <button onClick={handleDeleteDocument} disabled={deleting}
            className="flex items-center gap-1 text-sm text-red-400 hover:text-red-600 disabled:opacity-50">
            {deleting ? <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> :
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>}
            {deleting ? 'מוחק...' : 'מחק'}
          </button>
        )}

        {uploadSuccess && <span className="text-xs text-green-600">✓ הועלה</span>}

        {!hasFile && !uploading && (
          <span className="text-sm text-gray-400">לא הועלה קובץ</span>
        )}

        {docType !== 'id_document' && (
          <button
            onClick={handleToggleRequired}
            disabled={togglingRequired}
            className={`text-xs px-2 py-1 rounded-full border transition-colors disabled:opacity-50 mr-auto ${
              !isRequired
                ? 'bg-gray-100 text-gray-500 border-gray-200'
                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
            }`}
          >
            {togglingRequired ? '...' : isRequired ? 'סמן כ"לא נדרש"' : '✓ לא נדרש'}
          </button>
        )}

        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleFileUpload} />
      </div>
    </div>
  );
}
