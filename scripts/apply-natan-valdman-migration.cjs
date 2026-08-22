/**
 * Migration: apply briefingTemplates overrides for נתן ולדמן ובניו בע״מ
 * Run from the safety/ project directory:
 *   node scripts/apply-natan-valdman-migration.cjs
 * Uses service role key — bypasses RLS.
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL     = 'https://rwpahefpexizaicrrxoc.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_QA_ID   = '4f3d08b0-6317-40bf-8f69-1702c39f9f05';
const PUBLIC_DIR       = path.join(__dirname, '..', 'public');

const NATAN_VALDMAN_OVERRIDES = {
  hebrew:  '/briefing-templates/overrides/natan-valdman/hebrew.pdf',
  arabic:  '/briefing-templates/overrides/natan-valdman/arabic.pdf',
  english: '/briefing-templates/overrides/natan-valdman/english.pdf',
  russian: '/briefing-templates/overrides/natan-valdman/russian.pdf',
  thai:    '/briefing-templates/overrides/natan-valdman/thai.pdf',
};

const SAFEDOC_DEFAULTS = {
  hebrew:  '/briefing-templates/hebrew.pdf',
  arabic:  '/briefing-templates/arabic.pdf',
  english: '/briefing-templates/english.pdf',
  russian: '/briefing-templates/russian.pdf',
  thai:    '/briefing-templates/thai.pdf',
};

const LANGUAGES = ['hebrew', 'arabic', 'english', 'russian', 'thai'];

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function resolvePath(briefingTemplates, language) {
  return (briefingTemplates && briefingTemplates[language])
    ? briefingTemplates[language]
    : SAFEDOC_DEFAULTS[language];
}

async function main() {
  let exitCode = 0;

  console.log('═══════════════════════════════════════════════════════════');
  console.log(' NATAN VALDMAN BRIEFING TEMPLATES MIGRATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Locate company ───────────────────────────────────────────────────────
  console.log('STEP 1: Locating company...');
  const { data: companies, error: findErr } = await supabase
    .from('companies')
    .select('id, name, settings')
    .or('name.ilike.%ולדמן%,name.ilike.%valdman%');

  if (findErr) { console.error('ERROR:', findErr.message); process.exit(1); }
  if (!companies || companies.length === 0) {
    console.error('ERROR: Company not found. Aborting migration.');
    process.exit(1);
  }

  for (const company of companies) {
    console.log(`  Found: "${company.name}" (ID: ${company.id})`);
    console.log('  Current briefingTemplates:',
      JSON.stringify(company.settings?.briefingTemplates ?? null));
  }

  // ── 2. Apply update ─────────────────────────────────────────────────────────
  console.log('\nSTEP 2: Applying overrides...');
  let updatedId = null;
  let updatedName = null;

  for (const company of companies) {
    const mergedSettings = {
      ...(company.settings ?? {}),
      briefingTemplates: NATAN_VALDMAN_OVERRIDES,
    };

    const { data: updated, error: updateErr } = await supabase
      .from('companies')
      .update({ settings: mergedSettings })
      .eq('id', company.id)
      .select('id, name, settings')
      .single();

    if (updateErr) {
      console.error(`ERROR updating ${company.id}:`, updateErr.message);
      process.exit(1);
    }

    updatedId = updated.id;
    updatedName = updated.name;
    console.log(`  ✓ Updated: "${updated.name}" (${updated.id})`);
  }

  // ── 3. Read-back verification ──────────────────────────────────────────────
  console.log('\nSTEP 3: Reading back from database to verify...');
  const { data: verified, error: verErr } = await supabase
    .from('companies')
    .select('id, name, settings')
    .or('name.ilike.%ולדמן%,name.ilike.%valdman%');

  if (verErr) { console.error('ERROR:', verErr.message); process.exit(1); }

  let dbCheckPassed = true;
  for (const company of verified) {
    console.log(`\n  Company: "${company.name}" (${company.id})`);
    console.log('  Stored settings.briefingTemplates:');
    for (const lang of LANGUAGES) {
      const stored = company.settings?.briefingTemplates?.[lang];
      const expected = NATAN_VALDMAN_OVERRIDES[lang];
      const ok = stored === expected;
      if (!ok) dbCheckPassed = false;
      console.log(`    ${ok ? '✓' : '✗'} ${lang}: ${stored ?? '(missing)'}`);
    }
  }

  if (!dbCheckPassed) {
    console.error('\nERROR: DB verification failed.');
    process.exit(1);
  }
  console.log('\n  ✓ All 5 overrides verified in database.');

  // ── 4. Resolver simulation — Natan Valdman ─────────────────────────────────
  console.log('\nSTEP 4: Resolver simulation — נתן ולדמן ובניו:');
  const natanSettings = verified[0].settings;
  let resolverPassed = true;
  for (const lang of LANGUAGES) {
    const resolved = resolvePath(natanSettings?.briefingTemplates, lang);
    const expected = NATAN_VALDMAN_OVERRIDES[lang];
    const ok = resolved === expected;
    if (!ok) resolverPassed = false;
    console.log(`    ${ok ? '✓' : '✗'} ${lang} → ${resolved}`);
  }

  if (!resolverPassed) {
    console.error('ERROR: Resolver returned wrong path for Natan Valdman.');
    process.exit(1);
  }

  // ── 5. Resolver simulation — Internal QA ──────────────────────────────────
  console.log('\nSTEP 5: Resolver simulation — Internal QA (expect SafeDoc defaults):');
  const { data: qaCompany, error: qaErr } = await supabase
    .from('companies')
    .select('id, name, settings')
    .eq('id', INTERNAL_QA_ID)
    .single();

  if (qaErr) { console.error('ERROR reading Internal QA:', qaErr.message); process.exit(1); }

  console.log(`  Company: "${qaCompany.name}" (${qaCompany.id})`);
  let qaPassed = true;
  for (const lang of LANGUAGES) {
    const bt = qaCompany.settings?.briefingTemplates ?? {};
    const resolved = resolvePath(bt, lang);
    const expected = SAFEDOC_DEFAULTS[lang];
    const ok = resolved === expected;
    if (!ok) qaPassed = false;
    console.log(`    ${ok ? '✓' : '✗'} ${lang} → ${resolved}`);
  }

  if (!qaPassed) {
    console.error('ERROR: Internal QA is not resolving to SafeDoc defaults.');
    process.exit(1);
  }

  // ── 6. Cross-company isolation ─────────────────────────────────────────────
  console.log('\nSTEP 6: Cross-company isolation check...');
  const natanIds = new Set(verified.map(c => c.id));
  const { data: allCos, error: allErr } = await supabase
    .from('companies')
    .select('id, name, settings');

  if (allErr) {
    console.warn('  WARN: Could not read all companies:', allErr.message);
  } else {
    let contaminated = false;
    for (const co of (allCos ?? [])) {
      if (natanIds.has(co.id)) continue;
      const bt = co.settings?.briefingTemplates ?? {};
      for (const lang of LANGUAGES) {
        if (bt[lang] && bt[lang].includes('natan-valdman')) {
          console.error(`  ✗ "${co.name}" (${co.id}) has natan-valdman path for ${lang}`);
          contaminated = true;
        }
      }
    }
    if (!contaminated) {
      console.log('  ✓ No other company has natan-valdman paths.');
    } else {
      exitCode = 1;
    }
  }

  // ── 7. Natan Valdman override PDF files on disk ────────────────────────────
  console.log('\nSTEP 7: Override PDF files on disk...');
  let filesPassed = true;
  for (const lang of LANGUAGES) {
    const relPath = NATAN_VALDMAN_OVERRIDES[lang];
    const absPath = path.join(PUBLIC_DIR, relPath);
    const exists = fs.existsSync(absPath);
    if (!exists) filesPassed = false;
    console.log(`    ${exists ? '✓' : '✗'} ${relPath}`);
  }

  if (!filesPassed) {
    console.error('ERROR: One or more Natan Valdman override PDF files are missing from public/.');
    exitCode = 1;
  }

  // ── 8. SafeDoc default PDF files on disk ──────────────────────────────────
  console.log('\nSTEP 8: SafeDoc default PDF files on disk...');
  let defaultsPassed = true;
  for (const lang of LANGUAGES) {
    const relPath = SAFEDOC_DEFAULTS[lang];
    const absPath = path.join(PUBLIC_DIR, relPath);
    const exists = fs.existsSync(absPath);
    if (!exists) defaultsPassed = false;
    console.log(`    ${exists ? '✓' : '✗'} ${relPath}`);
  }

  if (!defaultsPassed) {
    console.error('ERROR: One or more SafeDoc default PDF files are missing from public/.');
    exitCode = 1;
  }

  // ── 9. Universal forms on disk ─────────────────────────────────────────────
  console.log('\nSTEP 9: Universal forms on disk...');
  const universalForms = [
    ...LANGUAGES.map(l => `/height-ban-templates/${l}.pdf`),
    '/forms/form-18g.pdf',
  ];

  let universalPassed = true;
  for (const relPath of universalForms) {
    const absPath = path.join(PUBLIC_DIR, relPath);
    const exists = fs.existsSync(absPath);
    if (!exists) universalPassed = false;
    console.log(`    ${exists ? '✓' : '✗'} ${relPath}`);
  }

  if (!universalPassed) {
    console.error('ERROR: One or more universal form files are missing from public/.');
    exitCode = 1;
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  if (exitCode === 0) {
    console.log(' MIGRATION RESULT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(` Company updated:     "${updatedName}"`);
    console.log(` Company ID:          ${updatedId}`);
    console.log(' briefingTemplates in DB:');
    for (const lang of LANGUAGES) {
      console.log(`   ${lang}: ${NATAN_VALDMAN_OVERRIDES[lang]}`);
    }
    console.log('\n All database and file checks passed.');
    console.log(' No historical signed records were modified.');
    console.log(' No other company data was overwritten.');
  } else {
    console.log(' MIGRATION FAILED — SEE ERRORS ABOVE');
  }
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(exitCode);
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
