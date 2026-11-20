/**
 * Group safety briefing (2026-11-20): one instructor briefs several workers in one session, each
 * worker signs on the device in turn, and every worker gets his own signed PDF and record —
 * exactly what the single-worker flow produces (lib/briefings/system-briefing.ts).
 *
 * Why: 55 of 77 active workers had no valid briefing, and briefings were done one by one
 * (4–9 a day). Pure helpers here; the screen is components/briefings/GroupBriefingFlow.tsx.
 */
import type { BriefingLanguage, DocumentStatus, WorkerWithDocuments } from '@/types';
import { getBriefingStatus, getLatestCompletedSafetyBriefing } from '@/lib/documents/status';

export type BriefingWorker = Pick<
  WorkerWithDocuments,
  'id' | 'full_name' | 'id_number' | 'is_active' | 'is_foreign_worker' | 'photo_url' | 'subcontractor_id' | 'safety_briefings'
> & { subcontractor?: { id: string; name: string } | null };

/** Status of the worker's briefing — the shared engine rule (latest completed briefing). */
export function briefingStatusOf(worker: Pick<WorkerWithDocuments, 'safety_briefings'>): DocumentStatus {
  return getBriefingStatus(getLatestCompletedSafetyBriefing(worker.safety_briefings ?? []));
}

/** Missing, expired or expiring within 14 days. */
export function needsBriefing(worker: Pick<WorkerWithDocuments, 'safety_briefings'>): boolean {
  const s = briefingStatusOf(worker);
  return s === 'missing' || s === 'expired' || s === 'expiring_soon';
}

export interface CandidateFilter {
  query?: string;
  onlyNeeding?: boolean;
  subcontractorId?: string;
}

/** Active workers to choose from, by name. */
export function briefingCandidates<W extends BriefingWorker>(workers: W[], f: CandidateFilter = {}): W[] {
  const q = (f.query ?? '').trim().toLowerCase();
  return workers
    .filter((w) => w.is_active)
    .filter((w) => !f.onlyNeeding || needsBriefing(w))
    .filter((w) => !f.subcontractorId || w.subcontractor_id === f.subcontractorId)
    .filter((w) => !q || w.full_name.toLowerCase().includes(q) || (w.id_number ?? '').includes(q))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'));
}

/** The language of the worker's last briefing, if any — usually right for the next one. */
export function lastBriefingLanguage(worker: Pick<WorkerWithDocuments, 'safety_briefings'>): BriefingLanguage | null {
  return getLatestCompletedSafetyBriefing(worker.safety_briefings ?? [])?.language ?? null;
}

export interface Participant {
  workerId: string;
  language: BriefingLanguage;
}

/** Languages in the order they first appear — one template presentation per language. */
export function languagesInOrder(participants: Participant[]): BriefingLanguage[] {
  return [...new Set(participants.map((p) => p.language))];
}

export type SignState = { kind: 'pending' } | { kind: 'signed'; signature: string } | { kind: 'skipped' };
export type SaveState =
  | { kind: 'waiting' }
  | { kind: 'saving'; status: string }
  | { kind: 'saved'; briefingId: string }
  | { kind: 'failed'; error: string };

/** First participant still to sign (index), or -1 when everyone signed or was skipped. */
export function nextToSign(order: string[], signs: Record<string, SignState>): number {
  return order.findIndex((id) => (signs[id]?.kind ?? 'pending') === 'pending');
}

export function summarize(order: string[], signs: Record<string, SignState>, saves: Record<string, SaveState>) {
  let signed = 0, skipped = 0, saved = 0, failed = 0, pending = 0;
  for (const id of order) {
    const s = signs[id]?.kind ?? 'pending';
    if (s === 'skipped') { skipped++; continue; }
    if (s === 'pending') { pending++; continue; }
    signed++;
    const v = saves[id]?.kind;
    if (v === 'saved') saved++;
    else if (v === 'failed') failed++;
  }
  return { signed, skipped, saved, failed, pending, unsaved: signed - saved };
}
