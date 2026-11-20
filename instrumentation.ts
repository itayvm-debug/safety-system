import type { Instrumentation } from 'next';

/**
 * Uncaught server errors (route handlers, server pages, server actions) → app_error_events and,
 * for the first one in an hour, an e-mail to the platform admins (lib/monitoring/server-errors.ts).
 * Handled errors that a route returns itself (e.g. `{ status: 500 }`) do not pass through here.
 */
export function register(): void {}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recordServerError } = await import('@/lib/monitoring/server-errors');
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : '';
  const path = request.path.split('?')[0];
  await recordServerError({
    source: `${context.routeType}:${path}`.slice(0, 100),
    status: 500,
    detail: `${message}${digest ? ` (digest ${digest})` : ''}`,
  });
};
