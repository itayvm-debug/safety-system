import { NextRequest, NextResponse } from 'next/server';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { resolveBriefingTemplatePath } from '@/lib/briefings/template-resolver';
import type { BriefingLanguage } from '@/types';

const VALID_LANGUAGES: BriefingLanguage[] = ['hebrew', 'arabic', 'english', 'russian', 'thai'];

export async function GET(request: NextRequest) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;

  const language = request.nextUrl.searchParams.get('language') as BriefingLanguage | null;
  if (!language || !VALID_LANGUAGES.includes(language)) {
    return NextResponse.json(
      { error: 'פרמטר language חסר או לא חוקי' },
      { status: 400 },
    );
  }

  const url = resolveBriefingTemplatePath(context.settings, language);
  return NextResponse.json({ url });
}
