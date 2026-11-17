/**
 * Identity extraction with AI sends an ID card / passport image to an external
 * processor (Anthropic). It stays OFF unless the deployment explicitly sets
 * AI_IDENTITY_EXTRACTION_ENABLED=true — an owner decision, not a code default.
 */
export function isAiIdentityExtractionEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.AI_IDENTITY_EXTRACTION_ENABLED === 'true';
}
