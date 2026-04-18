import { format, parseISO, isValid } from 'date-fns';
import { he } from 'date-fns/locale';

export function formatDateSafe(
  value: string | null | undefined,
  fmt = 'dd/MM/yyyy'
): string {
  if (!value) return '';
  try {
    const parsed = parseISO(value);
    if (!isValid(parsed)) return '';
    return format(parsed, fmt, { locale: he });
  } catch {
    return '';
  }
}
