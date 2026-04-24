'use client';

import { useEffect } from 'react';

export default function PwaRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    let focusHandler: (() => void) | undefined;

    navigator.serviceWorker
      // updateViaCache:'none' forces the browser to bypass HTTP cache when
      // fetching sw.js, so iOS always sees the latest version without reinstall
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        focusHandler = () => reg.update();
        window.addEventListener('focus', focusHandler);
        // Periodic check so long-running sessions also get updates
        interval = setInterval(focusHandler, 2 * 60 * 1000);
      })
      .catch(() => {
        // SW registration failure is non-fatal — app works normally
      });

    // When the new SW takes control (after skipWaiting + clients.claim),
    // reload the page so the user gets fresh content immediately
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      if (focusHandler) window.removeEventListener('focus', focusHandler);
      if (interval !== undefined) clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
