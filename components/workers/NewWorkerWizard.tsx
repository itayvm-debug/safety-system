'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type DocType = 'israeli_id' | 'passport';
type Step = 'doc-type' | 'upload' | 'extracting' | 'review';

interface ExtractedField {
  value: string | null;
  confidence: number;
}

interface ExtractionResult {
  success: boolean;
  document_type?: string;
  extracted?: {
    full_name: ExtractedField;
    national_id: ExtractedField;
    passport_number: ExtractedField;
    worker_type: ExtractedField;
  };
  overall_confidence?: number;
  warnings?: string[];
  error?: string;
}

function confidenceBorder(field: ExtractedField | undefined): string {
  if (!field || !field.value || field.confidence === 0) return 'border-gray-200';
  return field.confidence >= 0.8
    ? 'border-green-300 bg-green-50'
    : 'border-amber-300 bg-amber-50';
}

function ConfidenceBadge({ field }: { field: ExtractedField | undefined }) {
  if (!field || !field.value || field.confidence === 0) return null;
  if (field.confidence >= 0.8) {
    return <span className="text-xs text-green-600 font-normal">✓ זוהה</span>;
  }
  return <span className="text-xs text-amber-600 font-normal">⚠ לא בטוח</span>;
}

export default function NewWorkerWizard() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('doc-type');
  const [docType, setDocType] = useState<DocType>('israeli_id');
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [aiSkipped, setAiSkipped] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const workerCreatedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // מחיקת קובץ יתומה אם המשתמש עוזב לפני שמירת עובד
  useEffect(() => {
    return () => {
      if (uploadedPath && !workerCreatedRef.current) {
        fetch(`/api/upload?path=${encodeURIComponent(uploadedPath)}`, {
          method: 'DELETE',
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [uploadedPath]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'documents');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? 'שגיאה בהעלאה');
        return;
      }
      setUploadedPath(data.path);

      if (file.type === 'application/pdf') {
        setAiSkipped(true);
        setStep('review');
        return;
      }

      await runExtraction(data.path);
    } catch {
      setUploadError('שגיאת תקשורת');
    } finally {
      setUploading(false);
    }
  }

  async function runExtraction(path: string) {
    setStep('extracting');
    try {
      const res = await fetch('/api/ai/extract-worker-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, document_type: docType }),
      });
      const data: ExtractionResult = await res.json();
      if (res.ok && data.success && data.extracted) {
        setExtraction(data);
        if (data.extracted.full_name?.value) setFullName(data.extracted.full_name.value);
        if (data.extracted.national_id?.value) setNationalId(data.extracted.national_id.value);
        if (data.extracted.passport_number?.value) setPassportNumber(data.extracted.passport_number.value);
      } else {
        setAiSkipped(true);
      }
    } catch {
      setAiSkipped(true);
    }
    setStep('review');
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const isForeign = docType === 'passport';
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          is_foreign_worker: isForeign,
          national_id: isForeign ? null : nationalId.trim() || null,
          passport_number: isForeign ? passportNumber.trim() || null : null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const workerData = await res.json();
      if (!res.ok) {
        setSaveError(workerData.error ?? 'שגיאה ביצירת העובד');
        return;
      }

      workerCreatedRef.current = true;

      // קישור מסמך הזהות לעובד — best-effort
      if (uploadedPath) {
        fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker_id: workerData.id,
            doc_type: 'id_document',
            file_url: uploadedPath,
            expiry_date: null,
            is_required: true,
          }),
        }).catch(() => {});
      }

      router.push(`/workers/${workerData.id}`);
    } catch {
      setSaveError('שגיאת תקשורת');
    } finally {
      setSaving(false);
    }
  }

  const isForeign = docType === 'passport';
  const hasExtracted = !!extraction?.success && !!extraction?.extracted && !aiSkipped;

  // ── שלב 1: בחירת סוג מסמך ──────────────────────────────────────
  if (step === 'doc-type') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">סוג מסמך זיהוי</h2>
          <p className="text-sm text-gray-500">בחר את סוג המסמך לזיהוי העובד</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => { setDocType('israeli_id'); setStep('upload'); }}
            className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all"
          >
            <span className="text-4xl">🪪</span>
            <div className="text-center">
              <p className="font-semibold text-gray-900">תעודת זהות</p>
              <p className="text-xs text-gray-500 mt-0.5">עובד ישראלי</p>
            </div>
          </button>
          <button
            onClick={() => { setDocType('passport'); setStep('upload'); }}
            className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all"
          >
            <span className="text-4xl">📘</span>
            <div className="text-center">
              <p className="font-semibold text-gray-900">פספורט</p>
              <p className="text-xs text-gray-500 mt-0.5">עובד זר</p>
            </div>
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center">המערכת תנסה לזהות פרטים אוטומטית מהמסמך</p>
      </div>
    );
  }

  // ── שלב 2: העלאת קובץ ──────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('doc-type')} className="text-sm text-gray-400 hover:text-gray-700">
            ← חזור
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              העלאת {docType === 'israeli_id' ? 'תעודת זהות' : 'פספורט'}
            </h2>
            <p className="text-sm text-gray-500">תמונה ברורה של המסמך</p>
          </div>
        </div>

        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
            uploading
              ? 'border-orange-300 bg-orange-50 cursor-default'
              : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50 cursor-pointer'
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-orange-600 font-medium">מעלה קובץ...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl">📎</span>
              <p className="text-sm font-medium text-gray-700">לחץ לבחירת קובץ</p>
              <p className="text-xs text-gray-400">JPG, PNG, WEBP, PDF — עד 10MB</p>
            </div>
          )}
        </div>

        {uploadError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {uploadError}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    );
  }

  // ── שלב 3: זיהוי AI ────────────────────────────────────────────
  if (step === 'extracting') {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="w-12 h-12 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-center">
          <p className="font-semibold text-gray-900">מזהה פרטים מהמסמך...</p>
          <p className="text-sm text-gray-500 mt-1">אנא המתן</p>
        </div>
      </div>
    );
  }

  // ── שלב 4: טופס סקירה ──────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">פרטי העובד</h2>
        {hasExtracted ? (
          <p className="text-sm text-green-600 mt-0.5">✓ פרטים זוהו אוטומטית — אנא בדוק ואשר</p>
        ) : (
          <p className="text-sm text-gray-500 mt-0.5">
            {aiSkipped ? 'מלא את פרטי העובד ידנית' : 'מלא את פרטי העובד'}
          </p>
        )}
        {aiSkipped && !extraction && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
            זיהוי אוטומטי לא היה אפשרי — נא למלא ידנית
          </p>
        )}
      </div>

      {hasExtracted && extraction?.warnings && extraction.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          {extraction.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
          ))}
        </div>
      )}

      {/* שם מלא */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">
            שם מלא <span className="text-red-500">*</span>
          </label>
          {hasExtracted && <ConfidenceBadge field={extraction?.extracted?.full_name} />}
        </div>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="שם פרטי ושם משפחה"
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${
            hasExtracted ? confidenceBorder(extraction?.extracted?.full_name) : 'border-gray-200'
          }`}
        />
      </div>

      {/* מספר ת.ז / דרכון */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">
            {isForeign ? 'מספר דרכון' : 'מספר תעודת זהות'} <span className="text-red-500">*</span>
          </label>
          {hasExtracted && (
            <ConfidenceBadge
              field={isForeign
                ? extraction?.extracted?.passport_number
                : extraction?.extracted?.national_id}
            />
          )}
        </div>
        <input
          type="text"
          value={isForeign ? passportNumber : nationalId}
          onChange={(e) =>
            isForeign ? setPassportNumber(e.target.value) : setNationalId(e.target.value)
          }
          placeholder={isForeign ? 'מספר דרכון' : '9 ספרות'}
          dir="ltr"
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${
            hasExtracted
              ? confidenceBorder(
                  isForeign
                    ? extraction?.extracted?.passport_number
                    : extraction?.extracted?.national_id
                )
              : 'border-gray-200'
          }`}
        />
      </div>

      {/* טלפון */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">טלפון</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="אופציונלי"
          dir="ltr"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {/* הערות */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">הערות</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="אופציונלי"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
        />
      </div>

      {/* סוג עובד (read-only) */}
      <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <span>{isForeign ? '🌍' : '🇮🇱'}</span>
        <span>
          סוג עובד: <strong>{isForeign ? 'עובד זר' : 'עובד ישראלי'}</strong>
        </span>
      </div>

      {saveError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => router.push('/workers')}
          className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ביטול
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !fullName.trim() || (isForeign ? !passportNumber.trim() : !nationalId.trim())}
          className="flex-1 py-2.5 bg-orange-500 text-white font-medium rounded-xl hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'יוצר עובד...' : 'צור עובד'}
        </button>
      </div>
    </div>
  );
}
