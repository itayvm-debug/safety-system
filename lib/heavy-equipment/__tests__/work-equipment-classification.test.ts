/**
 * Work Equipment Classification regression tests
 *
 * WE1:  FEATURE_LABELS.heavyEquipment is 'כלי צמ"ה / עבודה'
 * WE2:  NavBar label for /heavy-equipment is updated
 * WE3:  ExportWizard equipment report option label is updated
 * WE4:  Dashboard title for heavy-equipment card is updated
 * WE5:  AlertsBell entity label for heavy_equipment is updated
 * WE6:  IssuesList entity label for heavy_equipment is updated
 * WE7:  weekly-report category label for heavy_equipment is updated
 * WE8:  generatePdf issues ENTITY_LABELS for heavy_equipment is updated
 * WE9:  generateExcel sheet name and issues label are updated
 * WE10: EquipmentForm description placeholder mentions קומפרסור
 * WE11: LiftingForm description placeholder mentions מעלית משא
 * WE12: lifting-equipment page subtitle mentions מעלית משא
 * WE13: Internal DB/API identifiers for heavy_equipment are NOT renamed
 * WE14: Internal DB/API identifiers for lifting_equipment are NOT renamed
 * WE15: HE and LE modules are separate API routes (no class mixing)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

function src(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

// ── WE1: FEATURE_LABELS constant ─────────────────────────────────────────────

import { FEATURE_LABELS } from '../../company/features';

describe('WE1: FEATURE_LABELS.heavyEquipment is updated', () => {
  it('equals כלי צמ"ה / עבודה', () => {
    expect(FEATURE_LABELS.heavyEquipment).toBe('כלי צמ"ה / עבודה');
  });
});

// ── WE2: NavBar ───────────────────────────────────────────────────────────────

describe('WE2: NavBar /heavy-equipment label is updated', () => {
  it('source contains כלי צמ"ה / עבודה for the heavy-equipment nav link', () => {
    const content = src('components/NavBar.tsx');
    expect(content).toContain("label: 'כלי צמ\"ה / עבודה'");
    expect(content).toContain("href: '/heavy-equipment'");
  });
});

// ── WE3: ExportWizard report option ──────────────────────────────────────────

describe('WE3: ExportWizard equipment report option label is updated', () => {
  it('source contains כלי צמ"ה / עבודה in REPORT_OPTIONS', () => {
    const content = src('components/export/ExportWizard.tsx');
    expect(content).toMatch(/כלי צמ[&\w;]*ה \/ עבודה/);
  });
  it('PDF title passed to buildEquipmentHtml is updated', () => {
    const content = src('components/export/ExportWizard.tsx');
    expect(content).toContain("buildEquipmentHtml(filtered, 'כלי צמ\"ה / עבודה'");
  });
});

// ── WE4: Dashboard card title ─────────────────────────────────────────────────

describe('WE4: Dashboard heavy-equipment card title is updated', () => {
  it('source contains כלי צמ"ה / עבודה as the card title', () => {
    const content = src('app/dashboard/page.tsx');
    expect(content).toContain("title='כלי צמ\"ה / עבודה'");
  });
});

// ── WE5: AlertsBell ───────────────────────────────────────────────────────────

describe('WE5: AlertsBell heavy_equipment label is updated', () => {
  it('source maps heavy_equipment to כלי צמ"ה / עבודה', () => {
    const content = src('components/alerts/AlertsBell.tsx');
    expect(content).toContain("heavy_equipment: 'כלי צמ\"ה / עבודה'");
  });
});

// ── WE6: IssuesList ───────────────────────────────────────────────────────────

describe('WE6: IssuesList heavy_equipment label is updated', () => {
  it('ENTITY_LABELS maps heavy_equipment to כלי צמ"ה / עבודה', () => {
    const content = src('components/issues/IssuesList.tsx');
    expect(content).toMatch(/heavy_equipment.*כלי צמ[&\w;]*ה \/ עבודה/);
  });
  it('filter option for heavy_equipment is updated', () => {
    const content = src('components/issues/IssuesList.tsx');
    expect(content).toMatch(/option.*heavy_equipment.*כלי צמ[&\w;]*ה \/ עבודה/);
  });
});

// ── WE7: weekly-report ────────────────────────────────────────────────────────

describe('WE7: weekly-report category label is updated', () => {
  it('source contains כלי צמ"ה / עבודה as category label', () => {
    const content = src('lib/email/weekly-report.ts');
    expect(content).toContain("label: 'כלי צמ\"ה / עבודה'");
  });
});

// ── WE8: generatePdf ENTITY_LABELS ────────────────────────────────────────────

describe('WE8: generatePdf ENTITY_LABELS for heavy_equipment is updated', () => {
  it('source maps heavy_equipment to כלי צמ"ה / עבודה', () => {
    const content = src('lib/export/generatePdf.ts');
    expect(content).toContain("heavy_equipment: 'כלי צמ\"ה / עבודה'");
  });
});

// ── WE9: generateExcel ────────────────────────────────────────────────────────

describe('WE9: generateExcel sheet name and ENTITY_LABELS are updated', () => {
  it('Excel sheet name is כלי צמ"ה / עבודה', () => {
    const content = src('lib/export/generateExcel.ts');
    expect(content).toContain("makeSheet('כלי צמ\"ה / עבודה'");
    expect(content).toContain("book_append_sheet(wb, ws, 'כלי צמ\"ה / עבודה')");
  });
  it('ENTITY_LABELS in generateIssuesExcel maps heavy_equipment to updated label', () => {
    const content = src('lib/export/generateExcel.ts');
    expect(content).toContain("heavy_equipment: 'כלי צמ\"ה / עבודה'");
  });
});

// ── WE10: EquipmentForm placeholder ───────────────────────────────────────────

describe('WE10: EquipmentForm description placeholder mentions קומפרסור', () => {
  it('placeholder includes קומפרסור אוויר as an example', () => {
    const content = src('components/heavy-equipment/EquipmentForm.tsx');
    expect(content).toContain('קומפרסור');
  });
});

// ── WE11: LiftingForm placeholder ─────────────────────────────────────────────

describe('WE11: LiftingForm description placeholder mentions מעלית משא', () => {
  it('placeholder includes מעלית משא as an example', () => {
    const content = src('components/lifting-equipment/LiftingForm.tsx');
    expect(content).toContain('מעלית משא');
  });
});

// ── WE12: lifting-equipment page subtitle ─────────────────────────────────────

describe('WE12: lifting-equipment page subtitle mentions מעלית משא', () => {
  it('page subtitle includes מעלית משא', () => {
    const content = src('app/lifting-equipment/page.tsx');
    expect(content).toContain('מעלית משא');
  });
});

// ── WE13: Heavy equipment internal identifiers are NOT renamed ────────────────

describe('WE13: Internal heavy_equipment DB/API identifiers are unchanged', () => {
  it('HE API route still uses /api/heavy-equipment path', () => {
    const content = src('app/api/heavy-equipment/route.ts');
    expect(content).toContain("from('heavy_equipment')");
  });
  it('HE type name heavy_equipment is still used in the codebase', () => {
    const content = src('types/index.ts');
    expect(content).toMatch(/HeavyEquipment|heavy_equipment/);
  });
});

// ── WE14: Lifting equipment internal identifiers are NOT renamed ──────────────

describe('WE14: Internal lifting_equipment DB/API identifiers are unchanged', () => {
  it('LE API route still uses /api/lifting-equipment path', () => {
    const content = src('app/api/lifting-equipment/route.ts');
    expect(content).toContain("from('lifting_equipment')");
  });
  it('LE type name lifting_equipment is still used in the codebase', () => {
    const content = src('types/index.ts');
    expect(content).toMatch(/LiftingEquipment|lifting_equipment/);
  });
});

// ── WE15: HE and LE are separate API routes (no class mixing) ────────────────

describe('WE15: Heavy equipment and lifting equipment remain separate modules', () => {
  it('HE API route does not query lifting_equipment table', () => {
    const heRoute = src('app/api/heavy-equipment/route.ts');
    expect(heRoute).not.toContain("from('lifting_equipment')");
  });
  it('LE API route does not query heavy_equipment table', () => {
    const leRoute = src('app/api/lifting-equipment/route.ts');
    expect(leRoute).not.toContain("from('heavy_equipment')");
  });
  it('EquipmentForm submits to /api/heavy-equipment', () => {
    const content = src('components/heavy-equipment/EquipmentForm.tsx');
    expect(content).toContain('/api/heavy-equipment');
    expect(content).not.toContain('/api/lifting-equipment');
  });
  it('LiftingForm submits to /api/lifting-equipment', () => {
    const content = src('components/lifting-equipment/LiftingForm.tsx');
    expect(content).toContain('/api/lifting-equipment');
    expect(content).not.toContain('/api/heavy-equipment');
  });
});
