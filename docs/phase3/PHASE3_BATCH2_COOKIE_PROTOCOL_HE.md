# Phase 3 Batch 2 — פרוטוקול Cookie: safedoc_active_company

## Cookies של המערכת

| Cookie | httpOnly | תפקיד | מי מגדיר | מי מוחק |
|--------|----------|--------|-----------|---------|
| `safedoc_session` | ✓ | HMAC session token | `/api/auth/login` | `/api/auth/logout` |
| `safedoc_role` | ✗ | display role (NavBar) | `/api/auth/login` | `/api/auth/logout` |
| `safedoc_active_company` | ✓ | active company UUID | login (auto) / `/api/session/company` POST | logout / DELETE |
| consent cookie | ✓ | גרסת הסכמה | login / `/legal-consent` | logout |

---

## מחזור חיי `safedoc_active_company`

### הגדרה
```
POST /api/auth/login (1 membership)  → set cookie automatically
POST /api/session/company            → set cookie after membership validation
```

### ניקוי
```
POST /api/auth/logout → maxAge=0
DELETE /api/session/company → maxAge=0
```

### קריאה בשרת
```typescript
import { getActiveCompanyId } from '@/lib/auth/active-company';
const id = await getActiveCompanyId(); // string | null
```

### אימות תמיד בשרת
```typescript
// לפני שימוש ב-company_id מהcookie — תמיד מאמתים membership:
const { data: membership } = await supabase
  .from('company_members')
  .select('company_id')
  .eq('user_id', session.userId)
  .eq('company_id', cookieCompanyId)
  .eq('is_active', true)
  .maybeSingle();
// אם membership === null → NEEDS_COMPANY_SELECTION / 403
```

---

## Rotation Logic

Cookie לא מתחדש אוטומטית בכל request (בניגוד ל-session cookie). הוא נשמר עד:
- logout מפורש
- DELETE `/api/session/company`  
- החלפת חברה (POST `/api/session/company` → override)
- פקיעה אחרי 7 ימים

אם ה-cookie פג תוקף / נמחק → המשתמש ידרש לעבור `/select-company` שוב אם יש לו 2+ memberships.

---

## UUID Validation

`getActiveCompanyId()` מאמת שהערך הוא UUID תקני (regex `/^[0-9a-f-]{36}$/`). ערך לא תקני מוחזר כ-`null` כדי למנוע injection.
