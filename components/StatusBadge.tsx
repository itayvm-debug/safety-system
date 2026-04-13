import { DocumentStatus } from '@/types';
import { STATUS_COLORS, STATUS_DOT_COLORS, STATUS_LABELS } from '@/lib/documents/status';

interface StatusBadgeProps {
  status: DocumentStatus;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${STATUS_COLORS[status]} ${sizeClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLORS[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
