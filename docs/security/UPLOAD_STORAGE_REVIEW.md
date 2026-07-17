# סקר העלאת קבצים ואחסון — SafeDoc
> נוצר: 2026-07-15

---

## 1. מנגנון העלאה נוכחי

### Flow
```
Client → POST /api/upload (FormData)
  → requireAdmin (auth check)
  → MIME validation (jpg/png/webp/pdf)
  → Size check (max 10MB)
  → supabase.storage.from('worker-files').upload(path, file)
  → Return { path: "folder/timestamp-random.ext" }
```

### פרטי Storage
- **Bucket:** `worker-files` (private)
- **מבנה path:** `{folder}/{timestamp}-{random6}.{ext}`
- **Upsert:** `false` (לא מדרס קבצים קיימים)
- **Content-Type:** לפי browser (מה-File object)

---

## 2. ממצאים

### 2.1 טוב — מה שכבר מיושם ✅

| בקרה | מצב | הערה |
|------|-----|-------|
| Bucket private | ✅ | קבצים לא נגישים ישירות |
| Signed URLs | ✅ | TTL = 3600 שניות |
| requireAdmin | ✅ | רק admin יכול להעלות |
| MIME allowlist | ✅ | jpg/png/webp/pdf בלבד |
| File size limit | ✅ | 10MB |
| Random filename | ✅ | אין חשיפת שם מקורי |
| No upsert | ✅ | לא מדרס קבצים |

### 2.2 ממצאים לשיפור

| # | ממצא | חומרה | המלצה |
|---|------|--------|--------|
| U-01 | **MIME מבוסס `file.type` בלבד** — דפדפן מגדיר; ניתן לזיוף | בינונית | לאמת magic bytes בשרת |
| U-02 | **אין בדיקת תוסף קובץ** — `split('.').pop()` מחזיר כל תוסף | נמוכה | לוולידציה תוסף מול MIME |
| U-03 | **אין ניקוי קבצים** — קובץ שהועלה ולא נקשר ל-DB נשאר בstorage | נמוכה | לוסף cleanup mechanism עתידי |
| U-04 | **Signed URL TTL = 3600 שניות** — שעה שלמה | נמוכה | לשקול: 15 דקות לתצוגה, שעה לdownload |
| U-05 | **DELETE /api/upload** — ניתן למחוק כל path ידוע | בינונית | לוולידציה שה-path שייך ל-DB record |
| U-06 | **אין content scanning** — לא בודק malware | נמוכה | Supabase Scan לא זמין ב-free tier; OK ל-MVP |
| U-07 | **אין ולידציה של `folder` param** — ניתן להכניס כל string | נמוכה | לוולידציה allowlist של folders |

---

## 3. תיקונים מומלצים

### U-07 — ולידציה של folder (דחוף, ללא migration)

```typescript
// app/api/upload/route.ts
const ALLOWED_FOLDERS = [
  'documents', 'photos', 'briefings', 'signatures',
  'appointments', 'heavy-equipment', 'lifting-equipment', 'vehicles',
];

const folder = (formData.get('folder') as string) || 'documents';
if (!ALLOWED_FOLDERS.includes(folder)) {
  return NextResponse.json({ error: 'תיקייה לא מורשית' }, { status: 400 });
}
```

### U-02 — ולידציה תוסף (ללא migration)

```typescript
const MIME_TO_EXT: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png':  ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};

const ext = (file.name.split('.').pop() ?? '').toLowerCase();
const validExts = MIME_TO_EXT[file.type] ?? [];
if (!validExts.includes(ext)) {
  return NextResponse.json({ error: 'אי-התאמה בין סוג הקובץ לתוסית' }, { status: 400 });
}
```

### U-01 — בדיקת magic bytes (אופציונלי)

```typescript
// לבדוק 4 bytes ראשונים של הקובץ
const buffer = await file.arrayBuffer();
const header = new Uint8Array(buffer.slice(0, 4));

function detectMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  // WebP: RIFF + WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  return null;
}
```

**⚠️ יש לבדוק performance impact לפני הוספה — לא לבצע ללא אישור.**

---

## 4. Signed URL — בדיקת TTL

```typescript
// app/api/signed-url/route.ts
const { data, error } = await supabase.storage
  .from('worker-files')
  .createSignedUrl(path, 3600, ...);  // שעה

// המלצה: הפחת ל-900 (15 דקות) לתצוגה רגילה
// השאר שעה רק כשdownload=1
```

**לשנות רק לאחר בדיקה שה-UI לא נשבר (תמונות ב-img src נדרשות לאורך שהות בדף).**

---

## 5. סיכום

אחסון הקבצים מאובטח באופן סביר ל-MVP. שתי פעולות פשוטות לשיקול מיידי (ללא migration):
1. **ולידציה folder allowlist** (U-07) — פשוט ובטוח
2. **ולידציה תוסף מול MIME** (U-02) — פשוט ובטוח

שאר הממצאים הם "nice to have" לשלב עתידי.
