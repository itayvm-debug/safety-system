'use client';

import { useState, useEffect, useRef } from 'react';
import type { EntityNote, EntityType } from '@/types';

interface Props {
  entityType: EntityType;
  entityId: string;
  disabled?: boolean;
}

const STATUS_LABELS = { ok: 'תקין', needs_attention: 'דורש טיפול' } as const;

function NoteStatusBadge({ status }: { status: EntityNote['status'] }) {
  if (status === 'needs_attention') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        דורש טיפול
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      תקין
    </span>
  );
}

function NoteForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: EntityNote;
  onSave: (content: string, status: EntityNote['status']) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [content, setContent] = useState(initial?.content ?? '');
  const [status, setStatus] = useState<EntityNote['status']>(initial?.status ?? 'ok');
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textRef.current?.focus(); }, []);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <textarea
        ref={textRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="תוכן ההערה..."
        rows={3}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 font-medium">סטטוס:</label>
        <div className="flex gap-2">
          {(['ok', 'needs_attention'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                status === s
                  ? s === 'needs_attention'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
        >
          ביטול
        </button>
        <button
          onClick={() => content.trim() && onSave(content.trim(), status)}
          disabled={!content.trim() || saving}
          className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-40 transition-colors"
        >
          {saving ? 'שומר...' : initial ? 'עדכן' : 'הוסף הערה'}
        </button>
      </div>
    </div>
  );
}

export default function EntityNotesButton({ entityType, entityId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<EntityNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const attentionCount = notes.filter((n) => n.status === 'needs_attention').length;

  async function loadNotes() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/entity-notes?entity_type=${entityType}&entity_id=${entityId}`);
      const data = await res.json();
      if (res.ok) setNotes(data);
      else setError(data.error ?? 'שגיאה בטעינה');
    } catch { setError('שגיאת תקשורת'); }
    finally { setLoading(false); }
  }

  function handleOpen() {
    setOpen(true);
    loadNotes();
  }

  async function handleAdd(content: string, status: EntityNote['status']) {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/entity-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, content, status }),
      });
      const data = await res.json();
      if (res.ok) { setNotes((prev) => [data, ...prev]); setAdding(false); }
      else setError(data.error ?? 'שגיאה');
    } catch { setError('שגיאת תקשורת'); }
    finally { setSaving(false); }
  }

  async function handleUpdate(id: string, content: string, status: EntityNote['status']) {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/entity-notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, status }),
      });
      const data = await res.json();
      if (res.ok) { setNotes((prev) => prev.map((n) => n.id === id ? data : n)); setEditingId(null); }
      else setError(data.error ?? 'שגיאה');
    } catch { setError('שגיאת תקשורת'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/entity-notes/${id}`, { method: 'DELETE' });
      if (res.ok) setNotes((prev) => prev.filter((n) => n.id !== id));
      else setError('שגיאה במחיקה');
    } finally { setDeletingId(null); }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={disabled}
        className="relative text-sm px-3 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 flex items-center gap-1.5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        הערות
        {attentionCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold leading-none">
            {attentionCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">הערות</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              {adding && (
                <NoteForm onSave={handleAdd} onCancel={() => setAdding(false)} saving={saving} />
              )}

              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : notes.length === 0 && !adding ? (
                <div className="text-center py-10 text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <p className="text-sm">אין הערות עדיין</p>
                </div>
              ) : (
                notes.map((note) =>
                  editingId === note.id ? (
                    <NoteForm
                      key={note.id}
                      initial={note}
                      onSave={(c, s) => handleUpdate(note.id, c, s)}
                      onCancel={() => setEditingId(null)}
                      saving={saving}
                    />
                  ) : (
                    <div key={note.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <NoteStatusBadge status={note.status} />
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => setEditingId(note.id)}
                            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                            עריכה
                          </button>
                          {confirmDeleteId === note.id ? (
                            <span className="flex items-center gap-1">
                              <button onClick={() => setConfirmDeleteId(null)} disabled={deletingId === note.id}
                                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">ביטול</button>
                              <button onClick={() => handleDelete(note.id)} disabled={deletingId === note.id}
                                className="text-xs text-red-600 font-medium hover:text-red-800 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-40">
                                {deletingId === note.id ? '...' : 'מחק'}
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(note.id)}
                              disabled={deletingId === note.id}
                              className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-40"
                            >
                              מחק
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {note.created_by && `${note.created_by} · `}
                        {new Date(note.created_at).toLocaleDateString('he-IL')}
                      </p>
                    </div>
                  )
                )
              )}
            </div>

            {/* Footer */}
            {!adding && (
              <div className="px-5 py-4 border-t border-gray-100">
                <button
                  onClick={() => { setAdding(true); setEditingId(null); }}
                  className="w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-colors"
                >
                  + הוסף הערה
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
