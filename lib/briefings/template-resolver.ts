import type { BriefingLanguage } from '@/types';
import type { ResolvedCompanySettings } from '@/lib/company/settings';

/** SafeDoc system-default template paths served from public/briefing-templates/ */
export const SAFEDOC_DEFAULT_TEMPLATE_PATHS: Record<BriefingLanguage, string> = {
  hebrew:  '/briefing-templates/hebrew.pdf',
  arabic:  '/briefing-templates/arabic.pdf',
  english: '/briefing-templates/english.pdf',
  russian: '/briefing-templates/russian.pdf',
  thai:    '/briefing-templates/thai.pdf',
};

/**
 * Resolves the briefing template URL for a given company and language.
 *
 * Resolution order:
 *   1. Company-specific override (settings.briefingTemplates[language])
 *   2. SafeDoc system default (/briefing-templates/{language}.pdf)
 *
 * This function is pure and has no side effects. It does not perform
 * filesystem or network checks — non-existent override paths fail at
 * load time (the iframe or fetch will get a 404), not here.
 */
export function resolveBriefingTemplatePath(
  settings: Pick<ResolvedCompanySettings, 'briefingTemplates'>,
  language: BriefingLanguage,
): string {
  return settings.briefingTemplates[language] ?? SAFEDOC_DEFAULT_TEMPLATE_PATHS[language];
}
