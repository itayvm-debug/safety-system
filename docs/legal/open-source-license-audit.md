# Open Source License Audit

**Version:** 1.0  
**Date:** 2026-09-12  
**Scope:** Production and development dependencies from `package.json`  
**Method:** Known license records per package; verify against published package metadata before legal reliance.  

> This audit covers known direct dependencies. Transitive (indirect) dependencies are not individually listed. A full SBOM (Software Bill of Materials) scan using a tool such as `license-checker` or `trivy` is recommended before commercial launch.

---

## Production Dependencies

| Package | Version | License | Risk | Notes |
|---------|---------|---------|------|-------|
| `next` | 16.2.2 | MIT | None | Framework; permissive |
| `react` | 19.2.4 | MIT | None | UI library |
| `react-dom` | 19.2.4 | MIT | None | |
| `@supabase/supabase-js` | latest | Apache-2.0 | None | Apache-2.0 is permissive; attribution in NOTICE file recommended |
| `@supabase/ssr` | latest | Apache-2.0 | None | |
| `resend` | latest | MIT | None | Email SDK |
| `date-fns` | latest | MIT | None | |
| `pdf-lib` | latest | MIT | None | |
| `@pdf-lib/fontkit` | latest | MIT | None | |
| `jspdf` | latest | MIT | None | |
| `html2canvas` | latest | MIT | None | |
| `xlsx` | 0.18.5 | **Apache-2.0** | **REVIEW** | SheetJS community edition. Versions after 0.18.5 changed to a non-OSS commercial license. **Must verify 0.18.5 is Apache-2.0 before upgrading.** |
| `zod` | latest | MIT | None | Schema validation |
| `tailwindcss` | latest | MIT | None | |
| `@fontsource/heebo` | latest | OFL-1.1 (SIL Open Font License) | None | Font; OFL permits use in any product. Attribution in UI is not required but recommended. |

---

## Development-Only Dependencies

| Package | Version | License | Risk | Notes |
|---------|---------|---------|------|-------|
| `typescript` | latest | Apache-2.0 | None | Dev only; not distributed |
| `@axe-core/playwright` | latest | MPL-2.0 | Note | Dev only. MPL-2.0 requires disclosure of modifications to the `axe-core` library itself, but not to application code. No distribution concern since this is a dev/test tool. |
| `@playwright/test` | latest | Apache-2.0 | None | Dev only |
| `vitest` | latest | MIT | None | Dev only |

---

## Overall Assessment

**No GPL, AGPL, or SSPL packages found in production dependencies.**  
**OSS license risk: Low.**

The only item requiring ongoing attention is `xlsx`:

> **Note on `xlsx` 0.18.5:** The SheetJS project changed its license in versions after 0.18.5 from Apache-2.0 to a non-OSS commercial license. Version 0.18.5 (used by SafeDoc) is believed to remain under Apache-2.0, but this must be verified against the package's own `LICENSE` file before any legal reliance. **If upgrading `xlsx` beyond 0.18.5, re-audit the license and consider switching to an alternative (e.g., `exceljs` under MIT) if the new license is incompatible with SafeDoc's distribution model.**

---

## Recommended Next Steps

1. Run `npx license-checker --production --summary` to generate a machine-readable SBOM of all production dependencies including transitive packages.
2. Verify `xlsx` 0.18.5 `LICENSE` file contents from the installed package.
3. Add license compliance check to CI pipeline (e.g., `license-checker --failOn GPL-2.0,GPL-3.0,AGPL-3.0,SSPL-1.0`).
4. Re-run this audit when any new production dependency is added.
