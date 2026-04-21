export type WorkerIdentifier = {
  is_foreign_worker: boolean;
  national_id: string | null;
  passport_number: string | null;
};

export function getWorkerIdentifierLabel(worker: WorkerIdentifier): string {
  return worker.is_foreign_worker ? 'מספר דרכון' : 'תעודת זהות';
}

export function getWorkerIdentifierValue(worker: WorkerIdentifier): string {
  return (worker.is_foreign_worker ? worker.passport_number : worker.national_id) ?? '';
}
