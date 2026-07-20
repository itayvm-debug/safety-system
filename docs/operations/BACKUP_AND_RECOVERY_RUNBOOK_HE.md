# ספר נהלי גיבוי ושחזור — SafeDoc
> תאריך: 2026-07-18 | גרסה: 1.0 | סיווג: פנימי

## 1. אסטרטגיית גיבוי

SafeDoc מסתמכת על שלוש שכבות גיבוי:

| שכבה | כלי | תדירות | אחסון | שחזור |
|------|-----|---------|-------|-------|
| **DB אוטומטי** | Supabase Pro PITR | רציף | Supabase | Dashboard |
| **Storage ידני** | backup-storage.ps1 | שבועי | ידני | ידני |
| **ייצוא לקוח** | /api/admin/export | לפי בקשה | מורד | ידני |

---

## 2. גיבוי DB — Supabase Pro

### 2.1 PITR (Point-in-Time Recovery)
- זמין ב-Supabase Pro ומעלה
- שחזור לכל נקודת זמן ב-30 יום האחרונים
- להפעיל: Supabase Dashboard → Settings → Database → Point-in-Time Recovery

### 2.2 Scheduled Backups
- Supabase Pro כולל daily backups
- שמורים 30 יום
- ניתן להוריד מ-Dashboard → Settings → Backups

### 2.3 שחזור מ-PITR
```
1. Supabase Dashboard → Settings → Database → Restore
2. בחר תאריך ושעה (UTC)
3. אשר — פעולה זו מחזירה את ה-DB לנקודה נבחרת
⚠️  נתונים שנוצרו אחרי נקודת השחזור יאבדו
```

---

## 3. גיבוי Storage — סקריפטים

### 3.1 גיבוי קבצים (backup-storage.ps1)

```powershell
# הרץ מתיקיית הפרויקט:
.\scripts\backup-storage.ps1 -OutputDir "C:\Backups\safedoc"
```

**מה הסקריפט עושה:**
- מייצא רשימת קבצים מ-Supabase Storage bucket `worker-files`
- שומר Signed URLs זמניות לקבצים פעילים
- כותב manifest JSON עם hash SHA-256 לכל קובץ

### 3.2 אימות גיבוי (verify-backup.ps1)

```powershell
.\scripts\verify-backup.ps1 -BackupDir "C:\Backups\safedoc\2026-07-18"
```

---

## 4. ייצוא נתונים מלא

### 4.1 דרך ממשק האדמין
```
GET /admin/export → לחץ "הורד ייצוא ZIP"
```

### 4.2 דרך API
```bash
curl -H "Cookie: safedoc_session=..." \
  https://safety-system-henna.vercel.app/api/admin/export \
  -o export-$(date +%Y%m%d).zip
```

**תוכן הקובץ:**
- manifest.json (גרסאות, SHA-256)
- {table}.jsonl לכל טבלה עסקית

---

## 5. שחזור מ-ZIP Export

⚠️ **אין Restore Engine אוטומטי.** שחזור מ-ZIP הוא פעולה ידנית.

```
1. פתח את ה-ZIP
2. בדוק manifest.json לאימות checksums
3. ייבא כל JSONL לטבלה המתאימה ב-Supabase
4. ודא שה-IDs (UUID) לא מתנגשים
5. בדוק פונקציונליות לאחר ייבוא
```

---

## 6. לוח זמנים מומלץ

| פעולה | תדירות | אחראי |
|-------|---------|-------|
| אימות Supabase PITR פעיל | חודשי | מנהל |
| גיבוי Storage ידני | שבועי | מנהל |
| ייצוא ZIP לאחסון חיצוני | חודשי | מנהל |
| בדיקת שחזור (dry-run) | רבעוני | מנהל |

---

## 7. RTO / RPO

| מטריקה | ערך | הסבר |
|--------|-----|-------|
| **RPO** (נקודת השחזור) | עד 24 שעות | Supabase PITR רציף |
| **RTO** (זמן שחזור) | 2-4 שעות | תלוי בגודל DB + זמן deploy |

---

## 8. סדר עדיפויות בשחזור

1. **DB פעיל** — שחזור מ-Supabase PITR
2. **אפליקציה פעילה** — Vercel deploy מ-main branch
3. **Storage** — שחזור קבצים ידני לפי צורך
4. **אימות** — בדיקת `/api/health` + `/api/admin/system-health`

---

*מסמך זה ייבדק ויעודכן ברבעון הראשון של כל שנה.*
