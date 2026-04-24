'use client';

import { useEffect } from 'react';

export default function PwaRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Check for updates on page focus
        window.addEventListener('focus', () => reg.update());
      })
      .catch(() => {
        // SW registration failure is non-fatal — app works normally
      });
  }, []);

  return null;
}
