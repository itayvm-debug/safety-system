# QA Session 07 — Archive / Company Members — Final Report

**תאריך:** 2026-08-12  
**סטטוס:** QA SESSION 07 COMPLETE — READY FOR SESSION 08

---

## סיכום מנהלים

סשן 07 כיסה שני מודולים בעדיפות גבוהה: **ארכיון / מחיקה קבועה** ו-**ניהול חברי חברה / הגדרות**. נכתבו 65 בדיקות (AR-01–AR-30 + CM-01–CM-35). ב-Phase A זוהו שלושה כשלונות — אחד מהם באג בקוד הייצור. לאחר Phase B (תיקונים) ו-Phase C (אימות + רגרסיות), **כל 65 הבדיקות עוברות** וכל הבדיקות הקיימות נותרות יציבות.

---

## מודולים שנבדקו

| מודול | נתיבי API | עמוד UI |
|-------|-----------|---------|
| Archive / Restore | `PATCH /api/workers/[id]` · `DELETE /api/workers/[id]` · subcontractors · vehicles | `/archive` |
| Company Members | `GET/POST /api/companies/members` · `PATCH/DELETE /api/companies/members/[memberId]` · `POST /api/companies/members/create-user` | `/company/members` |
| Company Settings | `GET/PATCH /api/companies/settings` | — |

---

## Phase A — גילוי כיסוי

### בדיקות שנוצרו

| קובץ | בדיקות | קטגוריות |
|------|--------|-----------|
| `tests/archive/archive.spec.ts` | AR-01–AR-30 (30) | גבול אימות · שמירת ארכיון · מחזור חיים · בידוד Cross-tenant · UI /archive · תת-קבלן · רכב |
| `tests/company-members/company-members.spec.ts` | CM-01–CM-35 (35) | גבול אימות · רישום חברים · הוספה באימייל · PATCH/DELETE · יצירת משתמש · הגדרות · UI |

### תשתית

**`tests/global-setup.ts`** — הוסף ניקוי משתמשי `@qa.test` לפני כל ריצה (section 3a-extra), כדי שבדיקות `create-user` לא ישאירו משתמשי Auth אמיתיים בין הריצות.

### תוצאות Phase A (ריצה 1)

```
62 passed, 3 failed
```

---

## Phase B — תיקוני באגים

### באג 1 (Production) — AR-12: `PATCH /api/workers/[id]` עם ID זר מחזיר 500 במקום 404

**קובץ:** `app/api/workers/[id]/route.ts` שורה 70  
**שורש הבעיה:** ה-PATCH handler השתמש ב-`.single()` על תוצאת ה-UPDATE. כאשר אין שורה תואמת (ID שייך לחברה אחרת), Supabase מחזיר שגיאת PGRST116 (0 rows). ה-handler לכד זאת ב-`dbError` והחזיר 500 — במקום 404.

**תיקון:**
```typescript
// לפני — .single() זורק PGRST116 כאשר 0 שורות → נתפס כ-500
.single();

// אחרי — .maybeSingle() מחזיר { data: null, error: null } → if (!data) → 404
.maybeSingle();
```

**אישור אבטחה:** `.eq('company_id', companyId)` נשאר בתוקף — בידוד cross-tenant נשמר. UPDATE לא משנה נתוני חברה זרה.

---

### באג 2 (בדיקה) — AR-22: Strict-mode violation ב-`not.toBeVisible()`

**שורש הבעיה:** `page.locator('text=workerName')` מחזיר **2 אלמנטים** כאשר המודאל פתוח (שורת הארכיון + תיבת המודאל, כל אחת מציגה את שם העובד). `expect().not.toBeVisible()` בPLaywright פועל ב-strict mode ודורש בדיוק אלמנט אחד — כשנמצאו שניים, נזרקה שגיאה.

בנוסף: לחיצה על כפתור האישור לא הייתה מסוקופת למודאל — בתנאים מסוימים עלולה הייתה ללחוץ על כפתור שגוי.

**תיקון:**
```typescript
// סיקוף כל אינטראקציות המודאל לאלמנט ה-overlay
const modal = page.locator('.fixed.inset-0').filter({ hasText: 'מחיקה לצמיתות' });
await modal.locator('input[type="checkbox"]').check();
await modal.locator('button', { hasText: 'מחק לצמיתות' }).click();

// toHaveCount(0) — עובד עם כל מספר אלמנטים, אין strict-mode violation
await expect(modal).not.toBeVisible({ timeout: 10_000 });
await expect(page.locator(`text=${workerName}`)).toHaveCount(0, { timeout: 5_000 });
```

הוסף גם `finally` block לניקוי במקרה של כישלון ביניים.

---

### באג 3 (בדיקה) — CM-29: שדה `company_name_override` לא קיים בסכמה

**שורש הבעיה:** הבדיקה שלחה `{ branding: { company_name_override: 'QA Test Company' } }` — אבל `CompanyBrandingSchema` ב-`lib/company/settings.ts` מגדיר את השדה כ-`displayName`. השרת קיבל את ה-PATCH (200) אבל התעלם מהשדה הלא-מוכר. ה-GET לאחר מכן החזיר `undefined`.

**תיקון:**
```typescript
// לפני — שדה לא קיים בסכמה
data: { branding: { company_name_override: 'QA Test Company' } }
expect(after.branding?.company_name_override).toBe('QA Test Company');

// אחרי — שדה תקני מ-CompanyBrandingSchema
data: { branding: { displayName: 'QA Test Company' } }
expect(after.branding?.displayName).toBe('QA Test Company');
```

---

## Phase C — אימות ורגרסיות

### ריצת Phase C — Archive + Company Members

```
65 passed (5.9m)
0 failed · 0 unexplained skips
```

### ריצת רגרסיה — Workers + Worker Compliance

```
139 passed, 1 skipped (29.7m)
```

הסקיפ הוא WC-44 — skip מותנה מובנה (ידוע מ-Session 06, לא שינינו).

---

## תוצאות Gate

| Gate | תוצאה | פרטים |
|------|--------|--------|
| ESLint | ✅ 0 errors | 8 warnings (pre-existing בקבצים שלא נגענו בהם) |
| TypeScript (`tsc --noEmit`) | ✅ 0 errors | — |
| Vitest | ✅ 465/465 | — |
| Archive + CM Playwright (Phase C) | ✅ 65/65 | 0 כשלונות |
| Workers Regression | ✅ 60/60 | יציב |
| Worker Compliance Regression | ✅ 79/79 + 1 skip | WC-44 skip ידוע |
| Next Build | ✅ exit 0 | כל הנתיבים קומפלו |

---

## ממצאי אבטחה ובידוד Cross-Tenant

### ביקורת נתיבים שנבדקו

| נתיב | הגנת company_id | תוצאת בדיקה |
|------|----------------|-------------|
| `PATCH /api/workers/[id]` | `.eq('company_id', companyId)` ב-UPDATE | AR-12: עכשיו 404 ✅ |
| `DELETE /api/workers/[id]` | pre-fetch + `.eq('company_id', companyId)` | AR-13: 404 ✅ |
| `PATCH /api/subcontractors/[id]` | `.eq('company_id', companyId)` | AR-14: 404 ✅ |
| `PATCH /api/vehicles/[id]` | `.eq('company_id', companyId)` | AR-15: 404 ✅ |
| `PATCH /api/companies/members/[memberId]` | `.eq('company_id', companyId)` | CM-13: 404 ✅ |
| `DELETE /api/companies/members/[memberId]` | `.eq('company_id', companyId)` | CM-14: 404 ✅ |
| `POST /api/companies/members/create-user` | `company_id` מ-session context בלבד | CM-15: אין הזרקת body ✅ |

**ממצא חשוב — AR-12 (Production Bug):** לפני התיקון, PATCH על ID זר החזיר **500** במקום 404. שגיאת 500 עם PGRST116 message עלולה לחשוף מידע על מבנה DB. לאחר התיקון: 404 נקי, ללא דליפת מידע.

---

## אישורי בטיחות

- לא בוצע שינוי ב-Company A / SafeDoc
- כל המוטציות ההרסניות רצו אך ורק נגד Company B = Internal QA
- הפיקסצ'ר עוצר אם "Internal QA" לא מזוהה בוודאות
- ניקוי משתמשי `@qa.test` מתבצע ב-global-setup לפני כל ריצה
- אין commit / push / deploy

---

## מסקנה

**QA SESSION 07 COMPLETE — READY FOR SESSION 08**

65 בדיקות חדשות (AR + CM) עוברות. 139 בדיקות רגרסיה יציבות. באג אחד בקוד ייצור תוקן (PATCH returns 500 on foreign ID). כל Gate עובר.
