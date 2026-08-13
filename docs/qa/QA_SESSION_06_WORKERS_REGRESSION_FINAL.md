# QA Session 06 — Workers Regression Stability — Final Report

**תאריך:** 2026-08-12  
**סטטוס:** QA SESSION 06 COMPLETE — WORKERS REGRESSION STABLE

---

## סיכום מנהלים

17 מתוך 60 בדיקות Workers נכשלו לפני הסשן. לאחר תיקוני תשתית בלבד (ללא שינוי קוד אפליקציה), הסוויטה עברה ל-**60/60 עם תוצאה זהה בשני ריצות רצופות**.

---

## תוצאות ריצות

| ריצה | תוצאה | הערה |
|------|--------|-------|
| Baseline (לפני Session 06) | 43/60 ✗ | 17 כשלונות — timeouts + order-dependent |
| Run 1 (תיקונים חלקיים) | 59/60 ✗ | W24 נכשל — race condition שתוקנה בזמן הריצה |
| **Run 2** | **60/60 ✓** | כל התיקונים פעילים |
| **Run 3** (אישור) | **60/60 ✓** | תוצאה זהה — **STABLE** |

---

## שורש הבעיות המקוריות (17 כשלונות)

### קבוצה א — 8 timeouts אמיתיים (W06, W08, W09, W13, W18, W20, W21, W35)
`waitForLoadState('networkidle')` חסם עד שסיימו **3 fetches מקבילות** בכל טעינת דף:
- `/api/session/companies` (NavBar SessionCompaniesProvider)
- `/api/alerts` (AlertsBell)
- `/api/workers` (WorkerList)

תקציב הזמן של 30 שניות לא הספיק ל-fixture + networkidle + גוף הבדיקה + ניקוי.

### קבוצה ב — 9 order-dependent (W17, W19, W23, W25, W26, W32, W37, W41, W49)
אותה בעיה מופיעה באיחור: לאחר 43 בדיקות, שרת ה-dev תחת עומס → networkidle ארך יותר → חורג מהתקציב.

### בעיה נוספת — SAFETY ABORT בגלל hydration race בפיקסצ'ר
הפיקסצ'ר המתין ל-`header` (SSR מיידי) → בדק אם "Internal QA" קיים → "SafeDoc" הופיע ב-SSR לפני שה-company name נטען client-side → SAFETY ABORT מוטעה.

---

## תיקונים שבוצעו

### 1. `playwright.config.ts`
```typescript
timeout: 60_000,  // was 30s default
```
הכפלת תקציב הזמן הגלובלי לכל בדיקה.

### 2. `tests/global-setup.ts`
**Hydration race fix** — הכפתור נשאר disabled כי React לא סיים לחבר `onChange`:
```typescript
await page.locator('input[type="text"]').fill(QA_EMAIL);
await page.locator('input[type="password"]').fill(QA_PASSWORD);
await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 10_000 });
await page.click('button[type="submit"]');
```

**waitForURL timeout fix** — "load" event איטי על warm dev server:
```typescript
await page.waitForURL(url => url.pathname !== '/login', {
  timeout: 30_000,
  waitUntil: 'domcontentloaded',
});
```

### 3. `tests/fixtures/workers-auth.ts`
**SAFETY ABORT fix** — מחכים ל-"Internal QA" client-side במקום ל-header SSR:
```typescript
await page.goto('/workers');
await page.waitForSelector('text=Internal QA', { timeout: 15_000 });
```

### 4. `tests/workers/workers.spec.ts`
- **Global replace**: כל `waitForLoadState('networkidle')` → `waitForSelector('h1', { timeout: 15_000 })`
- **W24**: `isVisible()` → `expect(showInactiveBtn).toBeVisible({ timeout: 15_000 })` + unconditional click
- **W27**: `waitForSelector('h1')` → `waitForSelector('a[href="/workers/${id}"]', { timeout: 15_000 })` לפני חיפוש
- **W45/W46**: `page2.waitForSelector('h1', { timeout: 15_000 })` + הגדלת timeouts של visibility

---

## Gate Results

| Gate | תוצאה |
|------|--------|
| ESLint | ✅ 0 errors (8 warnings pre-existing באחרים) |
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| Vitest | ✅ 465/465 |
| Workers Playwright (Run 2) | ✅ 60/60 |
| Workers Playwright (Run 3) | ✅ 60/60 — STABLE |
| Worker Compliance Playwright | ✅ 79 passed, 1 skipped (WC-44 — conditional skip מובנה), 0 failed |

---

## אישורי בטיחות

- לא בוצע שינוי ב-Company A / SafeDoc
- כל הריצות ההרסניות רצו אך ורק נגד Company B = Internal QA
- הפיקסצ'ר מפסיק אם "Internal QA" לא מזוהה בוודאות
- אין commit / push / deploy

---

## מסקנה

**QA SESSION 06 COMPLETE — WORKERS REGRESSION STABLE**

60/60 Workers tests עוברות בשתי ריצות רצופות. אין כשלונות תלויי סדר, אין skips לא מוסברים, אין מוטציה ב-Company A.
