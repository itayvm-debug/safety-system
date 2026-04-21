'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface Props {
  title: string;
  shape?: 'face' | 'object';
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

export default function CameraCapture({ title, shape = 'object', onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

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

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-out';

    if (shape === 'face') {
      const rx = Math.min(canvas.width, canvas.height) * 0.34;
      const ry = rx * 1.28;
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
    } else {
      const w = canvas.width * 0.78;
      const h = canvas.height * 0.60;
      const r = 20;
      const x = cx - w / 2;
      const y = cy - h / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('מקם את הציוד במסגרת', cx, cy + h / 2 + 28);
    }
  }, [shape]);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: shape === 'face' ? 'user' : { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
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
        if (!cancelled) setCameraError('לא ניתן לגשת למצלמה. אנא בדוק הרשאות.');
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [drawOverlay, shape]);

  function handleClose() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
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
    canvas.getContext('2d')!.drawImage(video, sx, sy, size, size, 0, 0, 640, 640);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setCapturedBlob(blob);
      setCapturedPreview(canvas.toDataURL('image/jpeg', 0.92));
    }, 'image/jpeg', 0.92);
  }

  function retake() {
    setCapturedBlob(null);
    setCapturedPreview(null);
  }

  function accept() {
    if (capturedBlob) onCapture(capturedBlob);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black">
        <button onClick={handleClose}
          className="text-white text-sm px-3 py-1.5 rounded-lg border border-white/30 hover:bg-white/10">
          ביטול
        </button>
        <span className="text-white font-medium text-sm">{title}</span>
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
              style={shape === 'face' ? { transform: 'scaleX(-1)' } : undefined}
            />
            <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          </>
        )}
      </div>

      {cameraError && (
        <div className="px-4 py-2 bg-red-900/80 text-red-200 text-sm text-center">{cameraError}</div>
      )}

      <div className="flex items-center justify-center gap-6 px-4 py-6 bg-black">
        {capturedPreview ? (
          <>
            <button onClick={retake}
              className="px-5 py-2.5 border border-white/40 text-white rounded-xl text-sm hover:bg-white/10">
              צלם שוב
            </button>
            <button onClick={accept}
              className="px-6 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600">
              השתמש בתמונה
            </button>
          </>
        ) : (
          <button onClick={capturePhoto}
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
            <span className="w-12 h-12 rounded-full bg-white border-4 border-gray-300 block" />
          </button>
        )}
      </div>
    </div>
  );
}
