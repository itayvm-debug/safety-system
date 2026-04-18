'use client';

import { useState } from 'react';

export default function SubmitFeedbackForm() {
  const [fullName, setFullName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !subject.trim() || !content.trim()) {
      setError('יש למלא את כל השדות');
      return;
    }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/site-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, subject, content }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה בשליחה'); return; }
      setSuccess(true);
      setFullName(''); setSubject(''); setContent('');
    } catch { setError('שגיאת תקשורת'); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">משוב מהשטח</h1>
        <p className="text-sm text-gray-500 mt-0.5">שלח הערות, בעיות או הצעות שיפור</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-4">
          ✓ הפנייה נשלחה בהצלחה. תודה על המשוב!
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא *</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="שמך המלא"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">נושא *</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="נושא הפנייה"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">תוכן *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="תאר את הבעיה, ההצעה או ההערה..."
            rows={5}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-orange-500 text-white py-3 rounded-xl font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {saving ? 'שולח...' : 'שלח משוב'}
        </button>
      </form>
    </div>
  );
}
