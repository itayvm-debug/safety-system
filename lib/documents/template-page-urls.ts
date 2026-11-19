import { TEMPLATE_PAGE_COUNTS, type TemplateKind } from './template-pages';

/**
 * Page images for a built-in PDF template, or null for anything else (e.g. a company's own
 * template), which the viewer then shows in an in-app frame.
 *
 * Why images: an installed web app on iPhone has no way back from a PDF opened in a new tab
 * (reported by the owner, 2026-11-19), and Safari shows only the first page of a PDF in an iframe.
 */
export function templatePageUrls(src: string): string[] | null {
  const m = /^\/(briefing|height-ban)-templates\/([a-z]+)\.pdf$/.exec(src);
  if (!m) return null;
  const kind = m[1] as TemplateKind;
  const count = (TEMPLATE_PAGE_COUNTS[kind] as Record<string, number>)[m[2]];
  if (!count) return null;
  return Array.from({ length: count }, (_, i) => `/${kind}-templates/pages/${m[2]}-${i + 1}.webp`);
}
