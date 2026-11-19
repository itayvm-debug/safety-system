import { TEMPLATE_PAGE_COUNTS } from './template-pages';

/**
 * Page images for a PDF template shipped with the app (built-in or a company override under
 * /briefing-templates/overrides/<company>/), or null for anything else, which the viewer then
 * shows in an in-app frame.
 *
 * Why images: an installed web app on iPhone has no way back from a PDF opened in a new tab
 * (owner, 2026-11-19), and Safari shows only the first page of a PDF in an iframe — which is what
 * happened in the field for the company-override templates until they got page images too.
 */
export function templatePageUrls(src: string): string[] | null {
  const count = Object.prototype.hasOwnProperty.call(TEMPLATE_PAGE_COUNTS, src) ? TEMPLATE_PAGE_COUNTS[src] : 0;
  if (!count) return null;
  const m = /^(.*)\/([^/]+)\.pdf$/.exec(src);
  if (!m) return null;
  return Array.from({ length: count }, (_, i) => `${m[1]}/pages/${m[2]}-${i + 1}.webp`);
}
