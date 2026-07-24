'use client';

import { useEffect, useRef, useState } from 'react';

export type OnlineState = 'unknown' | 'online' | 'offline';

async function checkHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): OnlineState {
  const [state, setState] = useState<OnlineState>('unknown');
  const failCount = useRef(0);
  const cancelled = useRef(false);
  const probeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cancelled.current = false;
    failCount.current = 0;

    async function probe() {
      if (cancelled.current) return;
      const healthy = await checkHealth();
      if (cancelled.current) return;

      if (healthy) {
        failCount.current = 0;
        setState('online');
      } else {
        failCount.current += 1;
        const navOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        if (failCount.current >= 2 || navOffline) {
          setState('offline');
        }
        // Continue probing: every 10 s until threshold, then every 30 s while offline
        const delay = failCount.current >= 2 ? 30_000 : 10_000;
        if (!cancelled.current) {
          probeTimer.current = setTimeout(probe, delay);
        }
      }
    }

    probe();

    const goOnline = () => {
      if (probeTimer.current) clearTimeout(probeTimer.current);
      failCount.current = 0;
      setState('online');
      probe();
    };
    const goOffline = () => setState('offline');

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      cancelled.current = true;
      if (probeTimer.current) clearTimeout(probeTimer.current);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return state;
}
