# סקר נגישות — SafeDoc
> נוצר: 2026-07-15 | ממצאי ראשוני מקריאת קוד
> **אין תחליף לבדיקה עם כלי אוטמציה (axe, Lighthouse) + בדיקת קורא מסך**
> **אל תצהיר "עומד בתקן 5568 / WCAG AA" עד לאחר בדיקה מלאה**

---

## 1. מה קיים — חיובי ✅

| אזור | ממצא |
|------|------|
| RTL/עברית | `<html lang="he" dir="rtl">` — נכון ✅ |
| Semantic HTML | שימוש ב-`<button>`, `<form>`, `<label>`, `<input>`, `<main>` — בסיסי ✅ |
| Focus ring | Tailwind `focus:ring-2 focus:ring-orange-400` ברוב שדות ✅ |
| Alt text על תמונות | `alt={manager.full_name}`, `alt={eq.description}` — מיושם ✅ |
| Loading states | skeleton loaders + `animate-pulse` — UX טוב ✅ |
| autoFocus בחיפוש | Modal search input עם `autoFocus` ✅ |
| Required indication | `required` attribute על inputs ✅ |

---

## 2. ממצאי נגישות — לפי חומרה

### 2.1 גבוה (פוגע בשימושיות לאנשים עם מוגבלות)

| # | ממצא | מיקום | קריטריון WCAG | תיקון |
|---|------|--------|---------------|--------|
| ACC-01 | **Modal — ניהול focus חסר** — לחיצה על פתיחת modal לא מעבירה focus אל תוכו | `WorkerVehicleCard.tsx`, `VehicleDetail.tsx` | 2.4.3, 4.1.3 | לוסף `autoFocus` ל-modal container / ראשון אלמנט |
| ACC-02 | **Modal — focus trap חסר** — Tab מחוץ למודל | כל המודלים | 2.1.2 | לוסף focus trap hook |
| ACC-03 | **Escape לסגירת modal** — לא מיושם בכל המודלים | modal components | 2.1.1 | לוסף `onKeyDown` עם Escape |
| ACC-04 | **aria-modal חסר** — קוראי מסך לא מזהים בעצמם | כל המודלים | ARIA 1.1 | `role="dialog" aria-modal="true" aria-labelledby="..."` |
| ACC-05 | **שדות ת"ז/דרכון** — `<label>` מקושר אך לא תמיד עם `htmlFor` | worker forms | 1.3.1 | לאמת `id`+`htmlFor` מתאימים |

### 2.2 בינוני

| # | ממצא | מיקום | תיקון |
|---|------|--------|--------|
| ACC-06 | **StatusBadge** — צבע בלבד (אדום/צהוב/ירוק) ללא טקסט/icon לצבע-עיוורים | `StatusBadge.tsx` | לוסף `aria-label="סטטוס: {status}"` |
| ACC-07 | **ToggleSwitch** — לא ברור ל-screen reader מה ה-state | `ToggleSwitch.tsx` | `role="switch" aria-checked={checked}` |
| ACC-08 | **aria-live חסר** — הודעות שגיאה דינמיות לא מוכרזות | forms, upload | `role="alert"` / `aria-live="polite"` |
| ACC-09 | **כפתורי action** עם icon בלבד (X, מצלמה) ללא aria-label | camera modal, close buttons | לוסף `aria-label` |
| ACC-10 | **ניגודיות** — orange-500 (#ea580c) על לבן: ratio ~3:1 לטקסט קטן | כפתורים ראשיים | WCAG AA דורש 4.5:1 לטקסט רגיל |
| ACC-11 | **Skip to content link** — חסר לניווט מקלדת | `layout.tsx` | לוסף `<a href="#main-content" className="sr-only focus:not-sr-only">` |
| ACC-12 | **`<img>` ישיר** — `eslint-disable` מסנן אזהרה על `<img>` — לאמת | HeavyEquipmentList, LiftingEquipmentList | לאמת alt texts |

### 2.3 נמוך / UX

| # | ממצא | תיקון |
|---|------|--------|
| ACC-13 | **tabIndex** על divs שפועלים כ-buttons | להמיר ל-`<button>` |
| ACC-14 | **`dir="ltr"`** על מספר ת"ז/דרכון | ✅ נעשה חלקית — לאמת בכל המקומות |
| ACC-15 | **`autoComplete`** בשדות כתובת/שם — עלול לסייע | לוסף `autocomplete="name"`, `autocomplete="address"` |

---

## 3. תיקונים מיידיים (ללא migration)

### ACC-03 — Escape לסגירת modals

דפוס אחיד להוסיף לכל modal div wrapper:
```tsx
onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
```

### ACC-04 — ARIA על modals

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  ...
>
  <h3 id="modal-title">כותרת המודל</h3>
  ...
</div>
```

### ACC-06 — StatusBadge aria-label

```tsx
<span className={...} aria-label={`סטטוס: ${STATUS_LABELS[status]}`}>
  {/* existing content */}
</span>
```

### ACC-07 — ToggleSwitch

```tsx
<button
  role="switch"
  aria-checked={checked}
  aria-label="מצב פעיל"
  ...
>
```

### ACC-08 — Error messages

```tsx
{error && (
  <div role="alert" aria-live="assertive" className="...">
    {error}
  </div>
)}
```

### ACC-09 — Close buttons

```tsx
<button onClick={onClose} aria-label="סגור חלון" className="...">✕</button>
```

---

## 4. ניגודיות צבעים — בדיקה

| צבע | שימוש | Ratio ל-#fff | WCAG AA (4.5:1) |
|-----|--------|-------------|-----------------|
| orange-500 (#ea580c) | כפתורים ראשיים | ~3.0:1 | ❌ לטקסט רגיל; ✅ לטקסט גדול (3:1) |
| orange-600 (#c2410c) | hover | ~4.5:1 | ✅ |
| gray-900 (#111827) | טקסט ראשי | ~16.7:1 | ✅ |
| gray-500 (#6B7280) | טקסט משני | ~4.6:1 | ✅ |
| red-500 (#ef4444) | שגיאה | ~3.9:1 | ❌ על לבן |
| yellow-500 (#eab308) | אזהרה | ~1.5:1 | ❌❌ |

**⚠️ orange-500 ו-yellow-500 על לבן אינם עומדים ב-WCAG AA לטקסט רגיל.**
לשקול: orange-700 (#c2410c) לטקסט/border; yellow-700 לטקסט.

---

## 5. RTL — בדיקות

| אזור | מצב |
|------|-----|
| כיוון HTML | ✅ `dir="rtl"` |
| מספרים/תאריכים | `dir="ltr"` על מספרי זהות, לוחית רישוי ✅ |
| Flex/Grid | Tailwind תומך RTL בברירת מחדל ✅ |
| Icons (arrow) | `rotate-180` לחצים — לאמת ✅ |
| Modal positioning | ✅ `justify-center` / `items-end` |

---

## 6. Keyboard Navigation

| נתיב | Tab order | Enter/Space | Escape |
|------|----------|------------|--------|
| Login page | ✅ | ✅ | — |
| Worker list | ✅ | ✅ | — |
| Worker detail | ✅ | ✅ | — |
| Vehicle picker modal | ✅ | ⚠️ לאמת | ❌ חסר |
| Camera modal | ⚠️ לא ידוע | ⚠️ לאמת | ❌ חסר |
| Export wizard | ⚠️ לאמת | ⚠️ לאמת | ❌ חסר |

---

## 7. פעולות מומלצות — לפי עדיפות

### מיידי (ללא migration)
1. Escape לסגירת כל המודלים (ACC-03)
2. `role="alert"` על כל הודעות שגיאה (ACC-08)
3. `aria-label` על כפתורי icon (ACC-09)
4. `role="switch" aria-checked` ל-ToggleSwitch (ACC-07)

### בהמשך
5. Focus trap ב-modals (ACC-02) — דורש hook
6. aria-modal + aria-labelledby (ACC-04)
7. בדיקת ניגודיות + עדכון צבעים (ACC-10)
8. Lighthouse + axe audit ידני

---

*מסמך זה הוא נקודת פתיחה. בדיקה מלאה עם NVDA + VoiceOver + axe-core נדרשת לפני הצהרת עמידה בתקן.*
