'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { inkBounds } from '@/lib/documents/signature-fit';

/**
 * Worker signature for the safety briefing and the height-ban form.
 * Owner feedback (2026-11-19): the signing box was too narrow (the height-ban box was 110px).
 * Now a tall inline box plus a full-screen mode (rotate the phone for a wide area).
 * The captured image contains only the inked area (see lib/documents/signature-fit.ts).
 */
export default function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const [fullScreen, setFullScreen] = useState(false);
  const [preview, setPreview] = useState('');
  const [inlineKey, setInlineKey] = useState(0);

  function clear() {
    setPreview('');
    setInlineKey(k => k + 1); // remount = empty canvas
    onCapture('');
  }

  return (
    <div>
      {preview ? (
        <div className="border-2 border-green-300 rounded-lg bg-white flex items-center justify-center p-3" style={{ height: 'clamp(200px, 50vw, 260px)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview of the signature */}
          <img src={preview} alt="החתימה שנקלטה" className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <DrawingCanvas key={inlineKey} onStroke={onCapture}
          className="border-2 border-dashed border-gray-300 rounded-lg"
          style={{ height: 'clamp(200px, 50vw, 260px)' }} />
      )}
      <div className="flex flex-wrap items-center gap-2 mt-1.5">
        <button type="button" onClick={clear} className="text-xs text-gray-600 hover:text-gray-800 px-2.5 py-1.5 border border-gray-200 rounded hover:bg-gray-50">נקה</button>
        <button type="button" onClick={() => setFullScreen(true)} className="text-xs text-orange-600 font-medium px-2.5 py-1.5 border border-orange-200 rounded hover:bg-orange-50">
          ⤢ חתימה במסך מלא
        </button>
      </div>

      {fullScreen && (
        <FullScreenSigner
          onCancel={() => setFullScreen(false)}
          onConfirm={(url) => { setFullScreen(false); setPreview(url); onCapture(url); }}
        />
      )}
    </div>
  );
}

function FullScreenSigner({ onConfirm, onCancel }: { onConfirm: (url: string) => void; onCancel: () => void }) {
  const [signature, setSignature] = useState('');
  const [padKey, setPadKey] = useState(0);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Rotating the phone resizes the pad; start a fresh one so strokes are not stretched
    const onResize = () => { setPadKey(k => k + 1); setSignature(''); };
    window.addEventListener('orientationchange', onResize);
    return () => { document.body.style.overflow = prev; window.removeEventListener('orientationchange', onResize); };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="חתימת העובד" className="fixed inset-0 z-[60] flex flex-col bg-gray-100" dir="rtl">
      <div className="flex items-center justify-between gap-2 bg-white border-b border-gray-200 px-4 py-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <p className="text-sm font-semibold text-gray-900">חתימת העובד</p>
        <p className="text-xs text-gray-500 portrait:block landscape:hidden">לשטח רחב יותר — סובב את הטלפון לרוחב</p>
      </div>
      <div className="flex-1 p-3 min-h-0">
        <DrawingCanvas key={padKey} onStroke={setSignature}
          className="border-2 border-dashed border-gray-300 rounded-xl h-full" style={{ height: '100%' }} />
      </div>
      <div className="flex gap-2 bg-white border-t border-gray-200 px-4 py-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <button type="button" disabled={!signature} onClick={() => onConfirm(signature)}
          className="flex-1 py-3 bg-orange-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
          אישור החתימה
        </button>
        <button type="button" onClick={() => { setPadKey(k => k + 1); setSignature(''); }}
          className="px-4 py-3 border border-gray-300 text-sm rounded-lg">נקה</button>
        <button type="button" onClick={onCancel} className="px-4 py-3 border border-gray-300 text-sm rounded-lg">ביטול</button>
      </div>
    </div>
  );
}

/** Canvas sized to its CSS box × devicePixelRatio; reports the trimmed signature after each stroke. */
function DrawingCanvas({ onStroke, className, style }: {
  onStroke: (dataUrl: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  }

  const down = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext('2d'); if (!ctx) return;
    drawing.current = true;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }, []);

  const move = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext('2d'); if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3 * (window.devicePixelRatio || 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    inked.current = true;
  }, []);

  const up = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (inked.current && canvas) onStroke(trimmedDataUrl(canvas));
  }, [onStroke]);

  return (
    <canvas ref={canvasRef} aria-label="אזור חתימה — חתום כאן באצבע"
      className={`w-full touch-none bg-white cursor-crosshair block ${className ?? ''}`}
      style={style}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
  );
}

function trimmedDataUrl(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const box = inkBounds(data, canvas.width, canvas.height, Math.round(8 * (window.devicePixelRatio || 1)));
  if (!box) return '';
  const out = document.createElement('canvas');
  out.width = box.w; out.height = box.h;
  out.getContext('2d')?.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return out.toDataURL('image/png');
}
