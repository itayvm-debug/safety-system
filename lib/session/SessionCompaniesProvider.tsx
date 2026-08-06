'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SessionCompany {
  id:       string;
  name:     string;
  logo_url: string | null;
  role:     string;
}

export interface SessionCompaniesState {
  companies:       SessionCompany[];
  activeCompanyId: string | null;
  platformRole:    'admin' | 'user' | null;
  loading:         boolean;
  error:           string | null;
}

export interface SessionCompaniesContextValue extends SessionCompaniesState {
  refreshSessionCompanies:    () => Promise<void>;
  broadcastAndRefresh:        () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const BROADCAST_CHANNEL_NAME = 'safedoc-session-companies';
export const BROADCAST_EVENT_TYPE   = 'SESSION_COMPANIES_CHANGED';

// Minimum gap between visibility/focus-triggered re-fetches (30 s).
const VISIBILITY_THROTTLE_MS = 30_000;

// ─── Pure utilities (exported for testing) ────────────────────────────────────

/**
 * Fetches /api/session/companies with no-store cache.
 * Returns an empty state for unauthenticated pages (401) without throwing.
 * Throws for all other non-OK responses.
 */
export async function fetchSessionCompanies(): Promise<Pick<
  SessionCompaniesState,
  'companies' | 'activeCompanyId' | 'platformRole'
>> {
  const res = await fetch('/api/session/companies', { cache: 'no-store' });

  if (res.status === 401) {
    // Public/unauthenticated page — expected, not an error.
    return { companies: [], activeCompanyId: null, platformRole: null };
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data: unknown = await res.json();

  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray((data as Record<string, unknown>).companies)
  ) {
    throw new Error('Invalid response shape');
  }

  const typed = data as {
    companies:       SessionCompany[];
    activeCompanyId: string | null;
    platformRole:    'admin' | 'user' | null;
  };

  return {
    companies:       typed.companies,
    activeCompanyId: typed.activeCompanyId ?? null,
    platformRole:    typed.platformRole ?? null,
  };
}

/**
 * Broadcasts a SESSION_COMPANIES_CHANGED event to other open tabs.
 * Data payload is a timestamp only — receivers must re-fetch; they must NOT
 * trust data from the broadcast message.
 */
export function broadcastSessionCompaniesChanged(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  bc.postMessage({ type: BROADCAST_EVENT_TYPE, timestamp: Date.now() });
  bc.close();
}

/**
 * Creates a version-guarded refresh executor.
 * Each call to the returned function increments an internal version counter.
 * If an older in-flight response arrives after a newer one has started, it is
 * silently discarded — preventing stale response overwrites.
 *
 * Exported for unit testing of the race-condition guarantee.
 */
export function createVersionedRefresher() {
  let version = 0;

  return async function refresh<T>(
    fetcher:   () => Promise<T>,
    onSuccess: (data: T) => void,
    onError:   (msg:  string) => void,
  ): Promise<void> {
    const thisVersion = ++version;
    try {
      const data = await fetcher();
      if (thisVersion !== version) return; // stale — discard
      onSuccess(data);
    } catch (err) {
      if (thisVersion !== version) return; // stale — discard
      onError(err instanceof Error ? err.message : 'שגיאת תקשורת');
    }
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SessionCompaniesContext =
  createContext<SessionCompaniesContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SessionCompaniesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SessionCompaniesState>({
    companies:       [],
    activeCompanyId: null,
    platformRole:    null,
    loading:         true,
    error:           null,
  });

  const mountedRef         = useRef(true);
  const lastFetchRef       = useRef<number>(0);
  const versionedRefresher = useRef(createVersionedRefresher());

  const refreshSessionCompanies = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    setState(prev => ({ ...prev, loading: true }));
    lastFetchRef.current = Date.now();

    await versionedRefresher.current(
      fetchSessionCompanies,
      (data) => {
        if (!mountedRef.current) return;
        setState({
          ...data,
          loading: false,
          error:   null,
        });
      },
      (msg) => {
        if (!mountedRef.current) return;
        // Preserve last verified state; expose non-blocking error.
        setState(prev => ({ ...prev, loading: false, error: msg }));
      },
    );
  }, []);

  /** Refresh + broadcast — call after any local mutation that affects company metadata. */
  const broadcastAndRefresh = useCallback(async (): Promise<void> => {
    await refreshSessionCompanies();
    broadcastSessionCompaniesChanged();
  }, [refreshSessionCompanies]);

  // Initial fetch on mount.
  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSessionCompanies();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshSessionCompanies]);

  // Cross-tab synchronization — receive events from other tabs.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);

    bc.onmessage = (event: MessageEvent<unknown>) => {
      // Only react to the typed event; ignore any payload data.
      // Security: a spoofed broadcast with embedded company data is ignored —
      // the re-fetch from the authoritative server is what updates state.
      if (
        event.data !== null &&
        typeof event.data === 'object' &&
        (event.data as Record<string, unknown>).type === BROADCAST_EVENT_TYPE
      ) {
        void refreshSessionCompanies();
      }
    };

    return () => bc.close();
  }, [refreshSessionCompanies]);

  // Visibility / focus recovery — throttled to avoid excessive requests.
  useEffect(() => {
    function maybeRefresh() {
      const now = Date.now();
      if (now - lastFetchRef.current > VISIBILITY_THROTTLE_MS) {
        void refreshSessionCompanies();
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') maybeRefresh();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', maybeRefresh);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', maybeRefresh);
    };
  }, [refreshSessionCompanies]);

  return (
    <SessionCompaniesContext.Provider
      value={{ ...state, refreshSessionCompanies, broadcastAndRefresh }}
    >
      {children}
    </SessionCompaniesContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSessionCompanies(): SessionCompaniesContextValue {
  const ctx = useContext(SessionCompaniesContext);
  if (!ctx) {
    throw new Error(
      'useSessionCompanies() must be called inside <SessionCompaniesProvider>',
    );
  }
  return ctx;
}
