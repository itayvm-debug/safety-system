import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Company } from '@/types';

vi.mock('../server', () => ({
  createServiceClient: vi.fn(),
}));

import { getCompanyForUser } from '../company';
import { createServiceClient } from '../server';

const DEFAULT_COMPANY: Company = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'SafeDoc',
  name_en: 'SafeDoc',
  slug: 'safedoc-default',
  registration: null,
  address: null,
  phone: null,
  contact_email: null,
  safety_email: null,
  settings: {},
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

function buildSupabaseMock(membershipResult: unknown, companyResult: unknown) {
  let callCount = 0;

  const makeSingle = (result: unknown) => ({
    single: vi.fn().mockResolvedValue(result),
  });

  const makeChain = (result: unknown) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(makeSingle(result)),
        }),
        single: vi.fn().mockResolvedValue(result),
      }),
      single: vi.fn().mockResolvedValue(result),
    }),
  });

  return {
    from: vi.fn().mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? makeChain(membershipResult) : makeChain(companyResult);
    }),
  };
}

describe('getCompanyForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when user has no active membership', async () => {
    const mockClient = buildSupabaseMock({ data: null, error: null }, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServiceClient).mockReturnValue(mockClient as any);

    const result = await getCompanyForUser('user-no-membership');
    expect(result).toBeNull();
  });

  it('returns the company when user has an active membership', async () => {
    const mockClient = buildSupabaseMock(
      { data: { company_id: DEFAULT_COMPANY.id }, error: null },
      { data: DEFAULT_COMPANY, error: null }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServiceClient).mockReturnValue(mockClient as any);

    const result = await getCompanyForUser('user-123');
    expect(result).toMatchObject({ id: DEFAULT_COMPANY.id, name: 'SafeDoc' });
  });

  it('calls company_members table first', async () => {
    const mockClient = buildSupabaseMock({ data: null, error: null }, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServiceClient).mockReturnValue(mockClient as any);

    await getCompanyForUser('user-123');
    expect(mockClient.from).toHaveBeenCalledWith('company_members');
  });

  it('does not query companies when membership is not found', async () => {
    const mockClient = buildSupabaseMock({ data: null, error: null }, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServiceClient).mockReturnValue(mockClient as any);

    await getCompanyForUser('user-123');
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.from).not.toHaveBeenCalledWith('companies');
  });
});
