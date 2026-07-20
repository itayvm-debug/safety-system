# בדיקות Post-Deployment — SafeDoc
> לביצוע לאחר כל הקמה ו-deploy חדש

## בדיקות קריטיות (חייבות לעבור)

### Health Endpoints
- [ ] `GET /api/health` → `{ "status": "ok" }`
- [ ] `GET /api/admin/system-health` (עם session admin) → database: ok, storage: ok

### Authentication
- [ ] כניסה עם admin (username/password) → redirect ל-/dashboard
- [ ] כניסה עם סיסמה שגויה → הודעת שגיאה ברורה
- [ ] ניסיון גישה ל-/dashboard ללא login → redirect ל-/login
- [ ] ניסיון גישה ל-/admin ללא admin → 403

### Consent
- [ ] כניסה ראשונה מציגה טופס הסכמה
- [ ] אישור הסכמה שומר ב-legal_acceptances ב-DB
- [ ] כניסה חוזרה (שוב) — לא מציגה הסכמה (כבר אושרה)

### CRUD עובדים
- [ ] יצירת עובד חדש (ישראלי)
- [ ] יצירת עובד חדש (עובד זר) + העלאת אשרת עבודה
- [ ] עריכת פרטי עובד
- [ ] ארכוב עובד
- [ ] חיפוש עובד לפי שם

### העלאת קבצים
- [ ] העלאת קובץ PDF → Signed URL מוחזר
- [ ] העלאת קובץ JPG
- [ ] ניסיון העלאה מעל 10MB → שגיאה 400
- [ ] ניסיון העלאת קובץ לא תקין (txt) → שגיאה 400

### עמודים משפטיים
- [ ] `/terms` → מציג גרסה 1.0, ללא Draft banner
- [ ] `/privacy` → מציג גרסה 1.0, ללא Draft banner
- [ ] `/accessibility` → נטען
- [ ] `/subprocessors` → מציג רשימת ספקים
- [ ] `/data-retention` → נטען
- [ ] `/about` → מציג גרסת מערכת

### ייצוא
- [ ] `GET /admin/export` → כפתור מוצג
- [ ] לחיצה → ZIP מורד
- [ ] manifest.json בתוך ZIP תקין

## בדיקות נוספות (מומלצות)

### PWA / Offline
- [ ] Service Worker מתרשם (DevTools → Application → Service Workers)
- [ ] מצב offline מציג OfflineBanner

### Security Headers
- [ ] https://securityheaders.com → בדוק B+ ומעלה
- [ ] X-Frame-Options: DENY ✓
- [ ] Content-Security-Policy ✓
- [ ] HSTS ✓ (production בלבד)

### Cron
- [ ] Vercel Dashboard → Cron Jobs → weekly-status מופיע

---

**תאריך בדיקה:** ____________
**בוצע על-ידי:** ____________
**תוצאה:** עבר □  נכשל □ (פרטים: _____________)
