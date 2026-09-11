import { NextResponse } from 'next/server';
import { getCurrentCompanyContext, type CompanyContext, type CompanyContextResult } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';

export interface ReviewAuthorContext extends CompanyContext {
  managerWorkerId: string;
}

type ReviewAuthorOk  = { context: ReviewAuthorContext; error: null };
type ReviewAuthorErr = { context: null; error: NextResponse };
export type ReviewAuthorResult = ReviewAuthorOk | ReviewAuthorErr;

/**
 * requireReviewAccess — for READ operations.
 *
 * Owners and admins get full access to all reviews for the company (no mapping
 * required). Members must be linked to a manager worker row.
 *
 * managerWorkerId will be '' for unlinked owners/admins.
 */
export async function requireReviewAccess(): Promise<ReviewAuthorResult> {
  const result = await getCurrentCompanyContext() as CompanyContextResult;
  if (result.error) return { context: null, error: result.error };

  const ctx = result.context;

  if (!ctx.settings.features.employeeReviews) {
    return {
      context: null,
      error: NextResponse.json({ error: 'תכונת משוב עובדים אינה פעילה' }, { status: 403 }),
    };
  }

  if (ctx.companyRole === 'owner' || ctx.companyRole === 'admin') {
    // Check for a personal mapping — used to scope dashboard to own manager workers if desired.
    const supabase = createServiceClient();
    const { data: mapping } = await supabase
      .from('manager_user_mappings')
      .select('manager_worker_id')
      .eq('company_id', ctx.companyId)
      .eq('user_id', ctx.userId)
      .maybeSingle();

    return {
      context: { ...ctx, managerWorkerId: mapping?.manager_worker_id ?? '' },
      error: null,
    };
  }

  // member role: must have a mapping
  const supabase = createServiceClient();
  const { data: mapping } = await supabase
    .from('manager_user_mappings')
    .select('manager_worker_id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (!mapping) {
    return {
      context: null,
      error: NextResponse.json(
        { error: 'אין לך הרשאה לגשת לאזור ביצועי עובדים — פנה למנהל לשיוך חשבון' },
        { status: 403 }
      ),
    };
  }

  return {
    context: { ...ctx, managerWorkerId: mapping.manager_worker_id },
    error: null,
  };
}

/**
 * requireReviewAuthor — for WRITE operations (submit review, claim worker).
 *
 * ALL roles must be linked to a manager worker row via manager_user_mappings.
 * Owners/admins without a personal mapping CANNOT submit reviews.
 *
 * This deliberately separates "review administration" (owner can read/report)
 * from "review authorship" (must be the recorded evaluator for the worker).
 * An audited administrative override is a separate future feature.
 */
export async function requireReviewAuthor(): Promise<ReviewAuthorResult> {
  const result = await getCurrentCompanyContext() as CompanyContextResult;
  if (result.error) return { context: null, error: result.error };

  const ctx = result.context;

  if (!ctx.settings.features.employeeReviews) {
    return {
      context: null,
      error: NextResponse.json({ error: 'תכונת משוב עובדים אינה פעילה' }, { status: 403 }),
    };
  }

  const supabase = createServiceClient();
  const { data: mapping } = await supabase
    .from('manager_user_mappings')
    .select('manager_worker_id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (!mapping) {
    return {
      context: null,
      error: NextResponse.json(
        { error: 'אין לך הרשאה להגיש ביצועי עובדים — יש לשייך חשבון למנהל אתר' },
        { status: 403 }
      ),
    };
  }

  return {
    context: { ...ctx, managerWorkerId: mapping.manager_worker_id },
    error: null,
  };
}
