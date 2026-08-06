'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ArchivedItem = {
  id: string;
  name: string;
  archived_at: string | null;
  archived_by: string | null;
  entityType: 'worker' | 'vehicle' | 'heavy_equipment' | 'lifting_equipment' | 'subcontractor';
  apiPath: string;
  href: string;
};

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

function ArchiveRow({ item, onRestored, onDeleted }: {
  item: ArchivedItem;
  onRestored: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [restoring, setRestoring]   = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [confirmed, setConfirmed]   = useState(false);
  const [rowError, setRowError]     = useState('');
  const [modalError, setModalError] = useState('');

  async function handleRestore() {
    setRestoring(true); setRowError('');
    try {
      const res = await fetch(`/api/${item.apiPath}/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: false }),
      });
      if (res.ok) onRestored(item.id);
      else { const d = await res.json(); setRowError(d.error ?? 'שגיאה'); }
    } catch { setRowError('שגיאת תקשורת'); } finally { setRestoring(false); }
  }

  function openDeleteModal() {
    setConfirmed(false);
    setModalError('');
    setShowModal(true);
  }

  async function confirmDelete() {
    if (!confirmed || deleting) return;
    setDeleting(true); setModalError('');
    try {
      const res = await fetch(`/api/${item.apiPath}/${item.id}`, { method: 'DELETE' });
      if (res.ok) {
        setShowModal(false);
        onDeleted(item.id);
      } else {
        const d = await res.json().catch(() => ({}));
        setModalError(d.error ?? 'שגיאה');
      }
    } catch { setModalError('שגיאת תקשורת'); } finally { setDeleting(false); }
  }

  const entityLabel = item.entityType === 'worker' ? 'העובד'
    : item.entityType === 'vehicle' ? 'הרכב'
    : item.entityType === 'subcontractor' ? 'קבלן המשנה'
    : 'הפריט';

  return (
    <>
      <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
          {(item.archived_at || item.archived_by) && (
            <p className="text-xs text-gray-400">
              {item.archived_by && `${item.archived_by} · `}
              {formatDate(item.archived_at)}
            </p>
          )}
          {rowError && <p className="text-xs text-red-600 mt-0.5">{rowError}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleRestore}
            disabled={restoring || deleting}
            className="text-xs px-3 py-1.5 border border-green-200 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
          >
            {restoring ? '...' : 'שחזר'}
          </button>
          <button
            onClick={openDeleteModal}
            disabled={restoring || deleting}
            className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            מחק לצמיתות
          </button>
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          dir="rtl"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">מחיקה לצמיתות</h2>
            <p className="text-sm text-gray-500 mb-4">
              פעולה זו תמחק לצמיתות את {entityLabel} ואת הנתונים המשויכים אליו, ולא ניתן יהיה לשחזר אותם.
            </p>

            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 border border-gray-200">
              <p className="text-sm font-semibold text-gray-900">{item.name}</p>
              {item.entityType === 'worker' && (
                <p className="text-xs text-gray-400 mt-0.5">עובד</p>
              )}
            </div>

            <label className="flex items-start gap-3 cursor-pointer mb-5 select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-red-600 cursor-pointer"
              />
              <span className="text-sm text-gray-700">אני מבין שלא ניתן לשחזר את הנתונים</span>
            </label>

            {modalError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                {modalError}
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={confirmDelete}
                disabled={!confirmed || deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[100px]"
              >
                {deleting ? 'מוחק...' : 'מחק לצמיתות'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ArchiveSection({
  title,
  items,
  onRestored,
  onDeleted,
}: {
  title: string;
  items: ArchivedItem[];
  onRestored: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      <div className="px-5">
        {items.map((item) => (
          <ArchiveRow key={item.id} item={item} onRestored={onRestored} onDeleted={onDeleted} />
        ))}
      </div>
    </div>
  );
}

interface Props {
  workers: { id: string; full_name: string; archived_at: string | null; archived_by: string | null }[];
  vehicles: { id: string; vehicle_number: string; vehicle_type: string; archived_at: string | null; archived_by: string | null }[];
  heavy: { id: string; description: string; archived_at: string | null; archived_by: string | null }[];
  lifting: { id: string; description: string; archived_at: string | null; archived_by: string | null }[];
  subcontractors: { id: string; name: string; archived_at: string | null; archived_by: string | null }[];
}

function makeItems<T extends { id: string; archived_at: string | null; archived_by: string | null }>(
  data: T[],
  getName: (item: T) => string,
  entityType: ArchivedItem['entityType'],
  apiPath: string,
  href: string | ((id: string) => string),
): ArchivedItem[] {
  return data.map((d) => ({
    id: d.id,
    name: getName(d),
    archived_at: d.archived_at,
    archived_by: d.archived_by,
    entityType,
    apiPath,
    href: typeof href === 'string' ? href : href(d.id),
  }));
}

export default function ArchiveClient({ workers, vehicles, heavy, lifting, subcontractors }: Props) {
  const router = useRouter();

  const [workerItems, setWorkerItems] = useState<ArchivedItem[]>(
    makeItems(workers, (d) => d.full_name, 'worker', 'workers', (id) => `/workers/${id}`)
  );
  const [vehicleItems, setVehicleItems] = useState<ArchivedItem[]>(
    makeItems(vehicles, (d) => `${d.vehicle_type} ${d.vehicle_number}`, 'vehicle', 'vehicles', (id) => `/vehicles/${id}`)
  );
  const [heavyItems, setHeavyItems] = useState<ArchivedItem[]>(
    makeItems(heavy, (d) => d.description, 'heavy_equipment', 'heavy-equipment', (id) => `/heavy-equipment/${id}`)
  );
  const [liftingItems, setLiftingItems] = useState<ArchivedItem[]>(
    makeItems(lifting, (d) => d.description, 'lifting_equipment', 'lifting-equipment', (id) => `/lifting-equipment/${id}`)
  );
  const [subItems, setSubItems] = useState<ArchivedItem[]>(
    makeItems(subcontractors, (d) => d.name, 'subcontractor', 'subcontractors', '/subcontractors')
  );

  const totalCount = workerItems.length + vehicleItems.length + heavyItems.length + liftingItems.length + subItems.length;

  function removeFromList(setFn: React.Dispatch<React.SetStateAction<ArchivedItem[]>>, id: string) {
    setFn((prev) => prev.filter((i) => i.id !== id));
  }

  function handleRestored(setFn: React.Dispatch<React.SetStateAction<ArchivedItem[]>>, id: string) {
    removeFromList(setFn, id);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ארכיון</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalCount === 0 ? 'הארכיון ריק' : `${totalCount} פריטים בארכיון`}
          </p>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8M10 12v4M14 12v4" />
          </svg>
          <p className="text-sm">אין פריטים בארכיון</p>
        </div>
      ) : (
        <>
          <ArchiveSection title="עובדים" items={workerItems}
            onRestored={(id) => handleRestored(setWorkerItems, id)}
            onDeleted={(id) => removeFromList(setWorkerItems, id)} />
          <ArchiveSection title="רכבים" items={vehicleItems}
            onRestored={(id) => handleRestored(setVehicleItems, id)}
            onDeleted={(id) => removeFromList(setVehicleItems, id)} />
          <ArchiveSection title="ציוד מכני כבד" items={heavyItems}
            onRestored={(id) => handleRestored(setHeavyItems, id)}
            onDeleted={(id) => removeFromList(setHeavyItems, id)} />
          <ArchiveSection title="ציוד הרמה" items={liftingItems}
            onRestored={(id) => handleRestored(setLiftingItems, id)}
            onDeleted={(id) => removeFromList(setLiftingItems, id)} />
          <ArchiveSection title="קבלני משנה" items={subItems}
            onRestored={(id) => handleRestored(setSubItems, id)}
            onDeleted={(id) => removeFromList(setSubItems, id)} />
        </>
      )}
    </div>
  );
}
