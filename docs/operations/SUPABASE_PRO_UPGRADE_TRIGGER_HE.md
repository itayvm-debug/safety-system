# טריגרים לשדרוג Supabase Pro — SafeDoc
> תאריך: 2026-07-18 | גרסה: 1.0 | סיווג: פנימי

## 1. מצב נוכחי

| פריט | מצב |
|------|-----|
| תוכנית Supabase | Free / Pro (לבדוק) |
| PITR (Point-in-Time Recovery) | Pro בלבד |
| Daily backups מלאים | Pro בלבד |
| גודל DB Max (Free) | 500 MB |
| גודל Storage Max (Free) | 1 GB |
| Edge Functions | Pro בלבד (ציוד עתידי) |

---

## 2. מתי לשדרג לPro

### טריגרים תפעוליים (חובה)
- [ ] לקוח ראשון שמעלה עובדים אמיתיים — **שדרג לפני deploy ל-production עם נתונים אמיתיים**
- [ ] גודל DB מתקרב ל-400 MB (80% מהחינמי)
- [ ] גודל Storage מתקרב ל-800 MB
- [ ] חובה חוזית ל-SLA עם לקוח

### טריגרים אבטחה
- [ ] נדרשת PITR (אינטרס לגיטימי לשחזור מדויק)
- [ ] נדרש Audit Logging מורחב
- [ ] לקוח מבקש הצהרת BCR / SLA

### טריגרים ביצועים
- [ ] השהיה > 500ms לשאילתות פשוטות
- [ ] מעל 100 concurrent users

---

## 3. עלות Pro (ליחידת פריסה/לקוח)

> מחיר נכון לתאריך מסמך זה — בדוק ב-https://supabase.com/pricing

| תוכנית | מחיר | כולל |
|--------|------|------|
| Free | $0 | 500MB DB, 1GB Storage, 50K auth users |
| Pro | $25/חודש | 8GB DB, 100GB Storage, PITR 7 ימים |
| Pro + Add-on PITR | $25 + PITR | PITR עד 28 ימים |

---

## 4. נוהל שדרוג

1. כנס ל-Supabase Dashboard של הפרויקט הרלוונטי
2. Settings → Billing → Upgrade to Pro
3. הגדר PITR: Settings → Database → Enable Point-in-Time Recovery
4. עדכן `SUPABASE_PRO_ENABLED=true` ב-Vercel (אם יש env var כזה)
5. בדוק `/api/admin/system-health` → checks.database: ok
6. תעד את השדרוג בלוג זה

---

## 5. לוג שדרוגים

| תאריך | פרויקט/לקוח | מ-Tier | ל-Tier | אחראי |
|-------|------------|--------|--------|-------|
| — | — | — | — | — |

---

*שים לב: כל פריסה (לקוח) היא פרויקט Supabase נפרד. צריך לשדרג כל אחד בנפרד.*
