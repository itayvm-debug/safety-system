'use client';

import { useState, useRef, useCallback } from 'react';

interface Props {
  folder: string;
  onUploaded: (path: string, fileName: string) => void;
  label?: string;
  currentFileName?: string;
  required?: boolean;
  disabled?: boolean;
  variant?: 'zone' | 'button';
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;
const COMPRESS_THRESHOLD = 3 * 1024 * 1024;

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1920;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export default function FileUploadZone({
  folder,
  onUploaded,
  label,
  currentFileName,
  required,
  disabled,
  variant = 'zone',
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [uploadedName, setUploadedName] = useState(currentFileName ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (raw: File) => {
    setError('');
    if (!ALLOWED_TYPES.includes(raw.type)) {
      setError('סוג קובץ לא נתמך — יש להעלות JPG, PNG, WEBP או PDF');
      return;
    }
    if (raw.size > MAX_BYTES) {
      setError('הקובץ גדול מדי — מקסימום 10MB');
      return;
    }

    let file = raw;
    setUploading(true);
    if (raw.type !== 'application/pdf' && raw.size > COMPRESS_THRESHOLD) {
      setProgress('דוחס תמונה...');
      file = await compressImage(raw);
    }

    setProgress('מעלה...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה בהעלאה'); return; }
      setUploadedName(raw.name);
      onUploaded(data.path, raw.name);
    } catch {
      setError('שגיאת תקשורת בהעלאה');
    } finally {
      setUploading(false);
      setProgress('');
    }
  }, [folder, onUploaded]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  const uploaded = !!uploadedName;

  if (variant === 'button') {
    return (
      <span>
        <button
          type="button"
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          disabled={disabled || uploading}
          className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {uploading ? progress : uploaded ? 'החלף מסמך' : 'העלה מסמך'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleInput}
          disabled={disabled || uploading}
        />
        {error && <span className="text-xs text-red-600 block mt-1">{error}</span>}
      </span>
    );
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-xs text-gray-500 font-medium">
          {label}{required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-2
          border-2 border-dashed rounded-xl px-4 py-5 transition-all cursor-pointer
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${dragOver ? 'border-orange-400 bg-orange-50' : uploaded ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-orange-300 hover:bg-orange-50'}
        `}
      >
        {uploading ? (
          <>
            <svg className="w-6 h-6 text-orange-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm text-orange-500 font-medium">{progress}</span>
          </>
        ) : uploaded ? (
          <>
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-green-700 font-medium text-center break-all">{uploadedName}</span>
            <span className="text-xs text-gray-400">לחץ להחלפת הקובץ</span>
          </>
        ) : (
          <>
            <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="text-sm text-gray-500 text-center">
              גרור לכאן או <span className="text-orange-500 font-medium">בחר קובץ</span>
            </span>
            <span className="text-xs text-gray-400">JPG, PNG, PDF — עד 10MB</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleInput}
          disabled={disabled || uploading}
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}
