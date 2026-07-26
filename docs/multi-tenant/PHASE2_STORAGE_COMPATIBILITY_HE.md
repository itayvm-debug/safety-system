# תאימות Storage — Phase 2 Batch 1

## מצב נוכחי: Flat Storage Paths

ה-bucket `worker-files` (private) מאחסן את כל הקבצים במבנה flat:

```
{folder}/{timestamp}-{randomHex}.{ext}
```

**דוגמאות:**
```
documents/1720000000000-a1b2c3d4e5f6a7b8.pdf
photos/1720000001000-12345678abcdef01.jpg
briefings/1720000002000-fedcba9876543210.pdf
signatures/1720000003000-0011223344556677.png
appointment-signatures/worker-uuid-operator-1720000004000.png
```

---

## השפעה של Phase 2 Batch 1 על Storage

**לא בוצע שינוי ב-Storage paths.** הקבצים הקיימים נשארים במיקומם.

**שינוי היחיד:** `/api/signed-url` כעת **מאמת ownership** לפני יצירת ה-URL.

### לפני: כל path מאומת יקבל URL
```typescript
// לפני — security gap קריטי
const { data } = await supabase.storage.from('worker-files').createSignedUrl(path, 3600);
```

### אחרי: ownership נבדק קודם
```typescript
// אחרי
const owned = await verifyPathOwnership(supabase, path, context.companyId);
if (!owned) return 403;
const { data } = await supabase.storage.from('worker-files').createSignedUrl(path, 3600);
```

---

## תאימות לאחור

### קבצים קיימים (לפני Phase 2 Batch 1)
✅ **תואמים לחלוטין.** הקבצים הקיימים מאוחסנים ב-`documents.*`, `workers.photo_url` וכו'. לאחר המיגרציה, שדות אלו ממשיכים לפנות לאותן paths — ורשומות ה-DB כעת יש להן `company_id` תואם.

### path ישן + DB record חדש
✅ הקובץ הישן בנתיב ישן + record ב-DB עם `company_id` = `ownership verified OK`.

---

## Phase 2 Batch 2 — שינוי מתוכנן

ב-Batch 2, ה-path format ישתנה לכלול `company_id`:

```
{companyId}/{folder}/{timestamp}-{randomHex}.{ext}
```

**דוגמה:**
```
00000000-0000-0000-0000-000000000001/documents/1720000000000-abc.pdf
```

### תאימות לאחור ב-Batch 2
כאשר Batch 2 יישום:
1. קבצים חדשים → נתיב עם company_id prefix
2. קבצים ישנים (Batch 1 ולפניו) → נתיב flat
3. `verifyPathOwnership()` יצטרך לזהות גם flat paths (כגון paths שלא מכילים `/` פרמטר UUID בתחילה)

**מסמך זה ישתנה ב-Batch 2.**

---

## אבטחה נוספת: Supabase Storage RLS

ב-Dashboard → Storage → worker-files → Policies:
- INSERT: authenticated users (מורשה דרך `worker-files` policy)
- SELECT: authenticated users (signed URLs בלבד)

**לא נדרש שינוי** ב-Storage bucket policies עבור Phase 2 Batch 1. ה-signed-url validation ברמת Application מספקת.

---

## סיכום

| נושא | Phase 2 Batch 1 | Phase 2 Batch 2 |
|------|----------------|-----------------|
| Path format | Flat (ללא שינוי) | Company-prefixed |
| Signed URL security | verifyPathOwnership() | verifyPathOwnership() + path prefix check |
| קבצים קיימים | תואמים | תואמים (flat paths מזוהים) |
| Storage bucket | ללא שינוי | ללא שינוי (אותו bucket) |
