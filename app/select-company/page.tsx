export const dynamic = 'force-dynamic';

import SelectCompanyClient from './SelectCompanyClient';

/**
 * /select-company — Company selection page for multi-membership users.
 * Auth required (middleware guards this). No company context required.
 * The client component fetches memberships and handles selection.
 */
export default function SelectCompanyPage() {
  return <SelectCompanyClient />;
}
