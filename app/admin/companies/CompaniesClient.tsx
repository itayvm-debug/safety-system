'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { Company } from '@/types';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  initialCompanies: Company[];
}

export default function CompaniesClient({ initialCompanies }: Props) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [showCreate, setShowCreate] = useState(false);

  function handleCreated(c: Company) {
    setCompanies(prev => [...prev, c]);
    setShowCreate(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ניהול חברות</h1>
          <p className="text-sm text-gray-500 mt-0.5">{companies.length} חברות במערכת</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          חברה חדשה
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {companies.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🏢</p>
            <p className="font-medium">אין חברות עדיין</p>
            <p className="text-sm mt-1">לחץ &quot;חברה חדשה&quot; כדי להוסיף את הראשונה</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">שם החברה</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">מזהה</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">ח.פ.</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">סטטוס</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">נוצרה</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {companies.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${!c.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {c.logo_url && (
                          <div className="w-7 h-7 rounded-md border border-gray-100 overflow-hidden bg-gray-50 flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={c.logo_url.startsWith('/') || c.logo_url.startsWith('http') ? c.logo_url : `/${c.logo_url}`} alt="" className="w-full h-full object-contain" aria-hidden="true" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{c.name}</p>
                          {c.name_en && <p className="text-xs text-gray-400">{c.name_en}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 hidden sm:table-cell">{c.slug ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{c.registration ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {c.is_active ? 'פעילה' : 'מושבתת'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                      {format(parseISO(c.created_at), 'dd/MM/yyyy', { locale: he })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/companies/${c.id}`}
                        className="text-xs text-orange-500 hover:text-orange-600 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors whitespace-nowrap"
                      >
                        פרטים
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateCompanyWizard onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateLogoFile(file: File): string | null {
  if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
    return 'סוג קובץ לא נתמך. יש להעלות PNG, JPG, JPEG או SVG.';
  }
  if (file.size > 2 * 1024 * 1024) {
    return 'הקובץ גדול מדי. מקסימום 2MB.';
  }
  return null;
}

// ─── Form types ───────────────────────────────────────────────────────────────

interface DetailsForm {
  name: string; name_en: string; slug: string; registration: string;
  address: string; phone: string; contact_email: string; safety_email: string;
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

function CreateCompanyWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Company) => void;
}) {
  const [step, setStep]                         = useState<'details' | 'success'>('details');
  const [createdCompany, setCreatedCompany]     = useState<Company | null>(null);

  const [form, setForm] = useState<DetailsForm>({
    name: '', name_en: '', slug: '', registration: '',
    address: '', phone: '', contact_email: '', safety_email: '',
  });
  const [slugEdited, setSlugEdited]             = useState(false);
  const [logoFile, setLogoFile]                 = useState<File | null>(null);
  const [logoPreview, setLogoPreview]           = useState<string | null>(null);
  const [isDragOver, setIsDragOver]             = useState(false);
  const [uploadedLogoPath, setUploadedLogoPath] = useState<string | null>(null);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoUrlRef   = useRef<string | null>(null);

  useEffect(() => {
    return () => { if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current); };
  }, []);

  // ── Logo ─────────────────────────────────────────────────────────────────

  function applyLogo(file: File) {
    const err = validateLogoFile(file);
    if (err) { setError(err); return; }
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    const url = URL.createObjectURL(file);
    logoUrlRef.current = url;
    setLogoFile(file);
    setLogoPreview(url);
    setUploadedLogoPath(null);
    setError('');
  }

  function removeLogo() {
    if (logoUrlRef.current) { URL.revokeObjectURL(logoUrlRef.current); logoUrlRef.current = null; }
    setLogoFile(null);
    setLogoPreview(null);
    setUploadedLogoPath(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Slug ─────────────────────────────────────────────────────────────────

  function setName(value: string) {
    setForm(prev => ({
      ...prev, name: value,
      slug: slugEdited ? prev.slug : (toSlug(prev.name_en) || toSlug(value)),
    }));
  }

  function setNameEn(value: string) {
    setForm(prev => ({
      ...prev, name_en: value,
      slug: slugEdited ? prev.slug : (toSlug(value) || toSlug(prev.name)),
    }));
  }

  function setSlugField(value: string) {
    setSlugEdited(value !== '');
    setForm(prev => ({ ...prev, slug: value }));
  }

  function setField(field: keyof DetailsForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // ── Close (with orphaned-logo cleanup) ───────────────────────────────────

  function handleClose() {
    if (logoUrlRef.current) { URL.revokeObjectURL(logoUrlRef.current); logoUrlRef.current = null; }
    if (uploadedLogoPath && step !== 'success') {
      fetch(`/api/admin/upload-logo?path=${encodeURIComponent(uploadedLogoPath)}`, { method: 'DELETE' })
        .catch(() => {});
    }
    onClose();
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let logoPath = uploadedLogoPath;
      if (logoFile && !logoPath) {
        const fd = new FormData();
        fd.append('file', logoFile);
        const uploadRes  = await fetch('/api/admin/upload-logo', { method: 'POST', body: fd });
        const uploadData = await uploadRes.json() as { error?: string; path?: string };
        if (!uploadRes.ok) { setError(uploadData.error ?? 'שגיאה בהעלאת הלוגו'); return; }
        logoPath = uploadData.path ?? null;
        setUploadedLogoPath(logoPath);
      }

      const res  = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...(logoPath ? { logo_url: logoPath } : {}),
        }),
      });
      const data = await res.json() as Company & { error?: string };
      if (!res.ok) { setError(data.error ?? 'שגיאה ביצירה'); return; }

      setUploadedLogoPath(null); // logo belongs to company now — skip cleanup on close
      setCreatedCompany(data);
      setStep('success');
      onCreated(data);
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40" onClick={handleClose}>
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
        <div
          className="w-full max-w-lg bg-white rounded-2xl shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900 text-base">
                {step === 'success' ? 'החברה נוצרה' : 'חברה חדשה'}
              </h2>
              {step === 'details' && (
                <p className="text-sm text-gray-500 mt-0.5 leading-snug">
                  מלא את פרטי החברה. אתה תשויך אוטומטית כבעלים הראשון.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="סגור"
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5 mr-2"
            >
              ×
            </button>
          </div>

          {/* ── Details form ── */}
          {step === 'details' && (
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Identity section */}
              <section aria-labelledby="section-identity">
                <h3 id="section-identity" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  זהות החברה
                </h3>

                {/* Logo */}
                <div className="mb-4">
                  <span className="block text-sm font-medium text-gray-700 mb-1.5">לוגו החברה</span>
                  {logoPreview ? (
                    <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl bg-gray-50">
                      <div className="w-14 h-14 flex-shrink-0 rounded-lg border border-gray-200 overflow-hidden bg-white flex items-center justify-center">
                        {/* blob: URL from createObjectURL — next/image cannot optimize blob URLs */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoPreview} alt="תצוגה מקדימה" className="w-full h-full object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate font-medium">{logoFile?.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {logoFile ? `${(logoFile.size / 1024).toFixed(0)} KB` : ''}
                        </p>
                      </div>
                      <button type="button" onClick={removeLogo}
                        className="flex-shrink-0 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                        הסר
                      </button>
                    </div>
                  ) : (
                    <div
                      role="button" tabIndex={0}
                      aria-label="גרור לכאן קובץ לוגו או לחץ לבחירה"
                      className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer select-none transition-colors ${isDragOver ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50'}`}
                      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) applyLogo(f); }}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                    >
                      <div className="text-3xl mb-1.5 text-gray-200" aria-hidden="true">🖼</div>
                      <p className="text-sm font-medium text-gray-600">גרור לכאן את הלוגו</p>
                      <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, SVG · מומלץ 512×512px · עד 2MB</p>
                      <p className="text-xs text-orange-500 font-medium mt-1.5">או לחץ לבחירה</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file"
                    accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                    aria-label="העלאת לוגו" className="sr-only"
                    onChange={e => { const f = e.target.files?.[0]; if (f) applyLogo(f); }} />
                </div>

                <div className="mb-3">
                  <label htmlFor="f-name" className="block text-sm font-medium text-gray-700 mb-1">שם החברה <span aria-hidden="true">*</span></label>
                  <input id="f-name" type="text" required autoComplete="organization"
                    value={form.name} onChange={e => setName(e.target.value)}
                    placeholder="חברת הבנייה בע״מ" className={inputCls} />
                </div>

                <div className="mb-3">
                  <label htmlFor="f-name-en" className="block text-sm font-medium text-gray-700 mb-1">שם החברה באנגלית (אופציונלי)</label>
                  <input id="f-name-en" type="text" dir="ltr"
                    value={form.name_en} onChange={e => setNameEn(e.target.value)}
                    placeholder="Construction Co Ltd" className={inputCls} />
                </div>

                <div className="mb-3">
                  <label htmlFor="f-slug" className="block text-sm font-medium text-gray-700 mb-1">מזהה החברה במערכת <span aria-hidden="true">*</span></label>
                  <input id="f-slug" type="text" required dir="ltr"
                    value={form.slug} onChange={e => setSlugField(e.target.value)}
                    placeholder="construction-co" className={inputCls} />
                  <p className="text-xs text-gray-400 mt-1">נוצר אוטומטית משם החברה וניתן לעריכה באנגלית בלבד.</p>
                </div>

                <div>
                  <label htmlFor="f-reg" className="block text-sm font-medium text-gray-700 mb-1">ח.פ. / ע.מ.</label>
                  <input id="f-reg" type="text"
                    value={form.registration} onChange={e => setField('registration', e.target.value)}
                    placeholder="512345678" className={inputCls} />
                </div>
              </section>

              {/* Contact section */}
              <section aria-labelledby="section-contact">
                <h3 id="section-contact" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  פרטי יצירת קשר
                </h3>

                <div className="mb-3">
                  <label htmlFor="f-phone" className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                  <input id="f-phone" type="tel"
                    value={form.phone} onChange={e => setField('phone', e.target.value)}
                    placeholder="050-1234567" className={inputCls} />
                </div>

                <div className="mb-3">
                  <label htmlFor="f-address" className="block text-sm font-medium text-gray-700 mb-1">כתובת</label>
                  <input id="f-address" type="text"
                    value={form.address} onChange={e => setField('address', e.target.value)}
                    placeholder="רחוב..., עיר..." className={inputCls} />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="f-contact-email" className="block text-sm font-medium text-gray-700 mb-1">מייל יצירת קשר</label>
                    <input id="f-contact-email" type="email" dir="ltr"
                      value={form.contact_email} onChange={e => setField('contact_email', e.target.value)}
                      placeholder="info@company.com" className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="f-safety-email" className="block text-sm font-medium text-gray-700 mb-1">מייל התראות בטיחות</label>
                    <input id="f-safety-email" type="email" dir="ltr"
                      value={form.safety_email} onChange={e => setField('safety_email', e.target.value)}
                      placeholder="safety@company.com" className={inputCls} />
                  </div>
                </div>
              </section>

              {error && <div role="alert" className={errorCls}>{error}</div>}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors"
                >
                  {loading ? 'יוצר...' : 'צור חברה'}
                </button>
                <button type="button" onClick={handleClose} disabled={loading}
                  className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-40">
                  ביטול
                </button>
              </div>
            </form>
          )}

          {/* ── Success ── */}
          {step === 'success' && createdCompany && (
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <span className="text-2xl" aria-hidden="true">✓</span>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 text-lg">החברה נוצרה והופעלה!</h3>
                <p className="text-gray-500 text-sm mt-1">{createdCompany.name}</p>
                {createdCompany.slug && (
                  <p className="text-xs text-gray-400 font-mono mt-0.5">/{createdCompany.slug}</p>
                )}
              </div>

              <p className="text-sm text-gray-500">
                שויכת כבעלים הראשון. ניתן להזמין את מנהל החברה הרשמי ולהגדיר את הרשאותיו מדף פרטי החברה.
              </p>

              <div className="flex gap-2 pt-1">
                <Link
                  href={`/admin/companies/${createdCompany.id}`}
                  className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors text-center"
                >
                  ראה פרטי חברה
                </Link>
                <button type="button" onClick={handleClose}
                  className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                  סגור
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent';
const errorCls =
  'bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm';
