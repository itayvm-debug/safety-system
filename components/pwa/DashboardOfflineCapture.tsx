'use client';

import { useEffect } from 'react';
import { saveSnapshot } from '@/lib/offline/cache';

interface DashboardSnap {
  urgentTotal: number;
  expiringTotal: number;
  workersCount: number;
  vehiclesCount: number;
  heavyCount: number;
  liftingCount: number;
}

export function DashboardOfflineCapture({ data }: { data: DashboardSnap }) {
  useEffect(() => {
    saveSnapshot('dashboard', data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
