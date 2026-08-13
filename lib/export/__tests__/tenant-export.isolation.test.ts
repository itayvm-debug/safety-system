/**
 * Tenant-branded export isolation tests
 *
 * C1 : Company A name appears in Company A export
 * C2 : Company B name appears in Company B export
 * C3 : Company A logo URL appears in Company A export, not Company B's
 * C4 : Worker data isolation — only passed workers appear in output
 * C5 : Null logo uses initials div, not a stale company logo URL
 * C6 : Concurrent calls with different brandings do not bleed into each other
 * C7 : Company B branding produces Company B name (not Company A)
 * C8 : Company A logo URL does not appear in Company B export
 * C9 : Branding is parameter-based — no global state leak between calls
 * C10: Footer contains "SafeDoc" and no personal name
 * C11: Record count in HTML matches input length
 * C12: buildVehiclesHtml also isolates branding correctly
 */

import { describe, it, expect } from 'vitest';
import { buildWorkersHtml, buildVehiclesHtml, type PdfBranding } from '../generatePdf';
import type { WorkerWithDocuments, Vehicle } from '@/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING_A: PdfBranding = {
  companyName: 'חברה א׳',
  logoUrl:     'https://example.com/logo-a.png',
};

const BRANDING_B: PdfBranding = {
  companyName: 'חברה ב׳',
  logoUrl:     'https://example.com/logo-b.png',
};

const BRANDING_NULL_LOGO: PdfBranding = {
  companyName: 'חברה ג׳',
  logoUrl:     null,
};

function makeWorker(overrides: Partial<WorkerWithDocuments> = {}): WorkerWithDocuments {
  return {
    id:                          '00000000-0000-0000-0000-000000000001',
    company_id:                  'cmp-test',
    full_name:                   'עובד לדוגמה',
    national_id:                 '123456789',
    passport_number:             null,
    id_number:                   null,
    is_foreign_worker:           false,
    is_active:                   true,
    is_archived:                 false,
    archived_at:                 null,
    archived_by:                 null,
    is_crane_operator:           false,
    is_responsible_site_manager: false,
    responsible_manager_id:      null,
    phone:                       null,
    subcontractor_id:            null,
    subcontractor:               null,
    photo_url:                   null,
    notes:                       null,
    project_name:                null,
    father_name:                 null,
    birth_year:                  null,
    profession:                  null,
    address:                     null,
    created_at:                  '2024-01-01T00:00:00Z',
    updated_at:                  '2024-01-01T00:00:00Z',
    documents:                   [],
    safety_briefings:            [],
    height_restrictions:         [],
    lifting_machine_appointments: [],
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id:                   '00000000-0000-0000-0000-000000000010',
    vehicle_type:         'רכב פרטי',
    vehicle_number:       '12-345-67',
    model:                null,
    vehicle_color:        null,
    image_url:            null,
    is_active:            true,
    is_archived:          false,
    archived_at:          null,
    archived_by:          null,
    assigned_manager_id:  null,
    project_name:         null,
    notes:                null,
    created_at:           '2024-01-01T00:00:00Z',
    updated_at:           '2024-01-01T00:00:00Z',
    vehicle_licenses:     [],
    vehicle_insurances:   [],
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('C1: Company A name appears in Company A export', () => {
  it('HTML output contains Company A name in header', () => {
    const pages = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_A);
    expect(pages[0]).toContain('חברה א׳');
  });
});

describe('C2: Company B name appears in Company B export', () => {
  it('HTML output contains Company B name in header', () => {
    const pages = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_B);
    expect(pages[0]).toContain('חברה ב׳');
  });
});

describe('C3: Company A logo URL appears in Company A export only', () => {
  it('Company A export contains logo-a.png', () => {
    const pagesA = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_A);
    expect(pagesA[0]).toContain('logo-a.png');
  });

  it('Company B export does not contain logo-a.png', () => {
    const pagesB = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_B);
    expect(pagesB[0]).not.toContain('logo-a.png');
  });
});

describe('C4: Worker data isolation — only passed workers appear', () => {
  it('only the passed worker appears in the HTML output', () => {
    const workerA = makeWorker({ id: 'aaa', full_name: 'דוד כהן' });
    const workerB = makeWorker({ id: 'bbb', full_name: 'משה לוי' });

    const pagesOnlyA = buildWorkersHtml([workerA], 'עובדים', BRANDING_A);
    expect(pagesOnlyA[0]).toContain('דוד כהן');
    expect(pagesOnlyA[0]).not.toContain('משה לוי');

    const pagesOnlyB = buildWorkersHtml([workerB], 'עובדים', BRANDING_B);
    expect(pagesOnlyB[0]).toContain('משה לוי');
    expect(pagesOnlyB[0]).not.toContain('דוד כהן');
  });
});

describe('C5: Null logo uses initials div, not another company\'s logo URL', () => {
  it('output contains an initials div, not an img tag with a URL', () => {
    const pages = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_NULL_LOGO);
    // Must not contain any logo URL from another company
    expect(pages[0]).not.toContain('logo-a.png');
    expect(pages[0]).not.toContain('logo-b.png');
    // Must contain the initials character from the company name
    const initials = BRANDING_NULL_LOGO.companyName.charAt(0);
    expect(pages[0]).toContain(initials);
  });

  it('null logo does not produce an img element at all', () => {
    const pages = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_NULL_LOGO);
    // No src="..." pointing to a logo URL when logoUrl is null
    expect(pages[0]).not.toMatch(/src="https?:\/\//);
  });
});

describe('C6: Concurrent calls with different brandings do not bleed', () => {
  it('two back-to-back calls produce isolated branding in each result', () => {
    const pagesA = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_A);
    const pagesB = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_B);

    // Each output has its own company name and not the other's
    expect(pagesA[0]).toContain('חברה א׳');
    expect(pagesA[0]).not.toContain('חברה ב׳');
    expect(pagesB[0]).toContain('חברה ב׳');
    expect(pagesB[0]).not.toContain('חברה א׳');
  });
});

describe('C7: Company B branding produces Company B name, not Company A', () => {
  it('Company B export header does not contain Company A name', () => {
    const pages = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_B);
    expect(pages[0]).not.toContain('חברה א׳');
    expect(pages[0]).toContain('חברה ב׳');
  });
});

describe('C8: Company A logo URL does not appear in Company B export', () => {
  it('Company B output does not reference logo-a.png', () => {
    const pages = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_B);
    expect(pages[0]).not.toContain('logo-a.png');
    expect(pages[0]).toContain('logo-b.png');
  });
});

describe('C9: Branding is parameter-based — no global state leak', () => {
  it('calling with Company A then Company B still gives correct branding each time', () => {
    // First call — Company A
    const first  = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_A);
    // Second call — Company B
    const second = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_B);
    // Third call — back to Company A
    const third  = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_A);

    expect(first[0]).toContain('חברה א׳');
    expect(second[0]).toContain('חברה ב׳');
    expect(third[0]).toContain('חברה א׳');
    // No global mutation: third call is identical in shape to first
    expect(third[0]).not.toContain('חברה ב׳');
  });
});

describe('C10: Footer contains "SafeDoc" and no personal name', () => {
  it('footer has SafeDoc platform credit, not a personal name', () => {
    const pages = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_A);
    expect(pages[0]).toContain('SafeDoc');
    // The hardcoded personal name that was removed
    expect(pages[0]).not.toContain('איתי ולדמן');
  });

  it('footer does not contain any company name from branding', () => {
    // Company name appears in the header, never in the footer
    const pages = buildWorkersHtml([makeWorker()], 'עובדים', BRANDING_A);
    const footerMatch = pages[0].match(/<div class="footer">([\s\S]*?)<\/div>/);
    expect(footerMatch).not.toBeNull();
    expect(footerMatch![1]).not.toContain('חברה א׳');
  });
});

describe('C11: Record count in HTML matches input length', () => {
  it('empty array produces count of 0', () => {
    const pages = buildWorkersHtml([], 'עובדים', BRANDING_A);
    expect(pages[0]).toContain('0 רשומות');
  });

  it('three workers produces count of 3', () => {
    const workers = [
      makeWorker({ id: '1', full_name: 'א' }),
      makeWorker({ id: '2', full_name: 'ב' }),
      makeWorker({ id: '3', full_name: 'ג' }),
    ];
    const pages = buildWorkersHtml(workers, 'עובדים', BRANDING_A);
    expect(pages[0]).toContain('3 רשומות');
  });
});

describe('C12: buildVehiclesHtml also isolates branding correctly', () => {
  it('Company A vehicle export has Company A name and logo', () => {
    const pages = buildVehiclesHtml([makeVehicle()], 'רכבים', BRANDING_A);
    expect(pages[0]).toContain('חברה א׳');
    expect(pages[0]).toContain('logo-a.png');
    expect(pages[0]).not.toContain('חברה ב׳');
  });

  it('Company B vehicle export has Company B name and logo', () => {
    const pages = buildVehiclesHtml([makeVehicle()], 'רכבים', BRANDING_B);
    expect(pages[0]).toContain('חברה ב׳');
    expect(pages[0]).toContain('logo-b.png');
    expect(pages[0]).not.toContain('חברה א׳');
  });
});
