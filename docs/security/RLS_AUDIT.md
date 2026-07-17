# סקר Row Level Security (RLS) — SafeDoc
> נוצר: 2026-07-15 | מבוסס על קריאת migrations
> **ממצאי ראשוניים — יש לאמת מול Supabase Dashboard → Table Editor → Policies**

---

## הקשר

**כל ה-API routes משתמשים ב-`createServiceClient` עם service_role key.**
**service_role עוקף RLS לחלוטין — RLS אינו קו ההגנה הראשי של המערכת.**

ההגנה הראשית: middleware + `requireAuth()` / `requireAdmin()` ב-API routes.

RLS ב-SafeDoc משמש כ:
1. **Defense in depth** — במקרה של דליפת anon key
2. **הגנה על גישה ישירה ל-Supabase API** (דרך supabase-js ב-client)
3. **עתיד:** multi-tenant isolation

---

## מצב RLS לפי טבלה

| טבלה | RLS מופעל | Policies | הערה |
|------|----------|----------|-------|
| `authorized_phones` | ✓ | SELECT to authenticated | ✅ קריאה בלבד; מניעת שינוי ישיר |
| `workers` | ✓ | ALL to authenticated | ⚠️ כל auth user יכול לשנות; OK ל-single-tenant |
| `documents` | ✓ | ALL to authenticated | ⚠️ כנ"ל |
| `profiles` | ✓ | SELECT own only | ✅ הגנה טובה — user רואה רק עצמו |
| `subcontractors` | ✓ | CRUD to authenticated | ⚠️ כנ"ל |
| `entity_notes` | ✓ | ALL to authenticated | ⚠️ כנ"ל |
| `safety_briefings` | ✓ | SELECT auth + service_role ALL | ✅ קריאה לכולם; כתיבה רק service_role |
| `height_restrictions` | ✓ | ALL to authenticated | ⚠️ |
| `heavy_equipment` | ✓ | ALL to authenticated | ⚠️ |
| `lifting_equipment` | ✓ | ALL to authenticated | ⚠️ |
| `lifting_machine_appointments` | ✓ | ALL to authenticated | ⚠️ |
| `vehicles` | ❓ | **לא ידוע** — לאמת ב-Dashboard | ⚠️ לבדוק |
| `vehicle_licenses` | ❓ | **לא ידוע** | ⚠️ לבדוק |
| `vehicle_insurances` | ❓ | **לא ידוע** | ⚠️ לבדוק |
| `heavy_equipment_insurances` | ❓ | **לא ידוע** | ⚠️ לבדוק |
| `manager_licenses` | ❓ | **לא ידוע** | ⚠️ לבדוק |
| `manager_insurances` | ❓ | **DEPRECATED** | לבדוק |
| `audit_logs` (עתידי) | לא קיים | — | יוצר בשלב יד׳ |
| `legal_acceptances` (עתידי) | לא קיים | — | יוצר בשלב יד׳ |

---

## ניתוח סיכונים לפי policy

### "ALL to authenticated" (רוב הטבלאות)

**משמעות:** כל מי שיש לו anon/service key + JWT תקין (Supabase Auth) יכול לשנות **הכל** ב-DB ישירות.

**בהקשר הנוכחי:**
- אין גישת client-side לDB (אין supabase-js ב-client)
- כל הגישה דרך API routes עם service_role
- אנשי Supabase Project עם Dashboard access יכולים לשנות ישירות

**סיכון בפועל:** נמוך-בינוני בשלב MVP single-tenant. גבוה יותר ב-multi-tenant.

### "SELECT own only" (profiles)

**משמעות:** user יכול לקרוא רק את הפרופיל שלו.
**בחולשה:** הוסף INSERT/UPDATE policies? אחרת user יכול לכתוב לכל profiles בגישה ישירה.

---

## המלצות RLS

### עדיפות גבוהה

1. **`audit_logs`** — כש-insert בלבד דרך service_role; **אין UPDATE/DELETE לאף אחד**
   ```sql
   -- Policy: insert service_role only
   CREATE POLICY "audit_logs_insert" ON audit_logs
     FOR INSERT TO service_role WITH CHECK (true);
   -- אין SELECT/UPDATE/DELETE policies = אפס גישה ל-anon/authenticated
   ```

2. **`legal_acceptances`** — append-only, service_role בלבד
   ```sql
   CREATE POLICY "legal_acceptances_insert" ON legal_acceptances
     FOR INSERT TO service_role WITH CHECK (true);
   CREATE POLICY "legal_acceptances_select_own" ON legal_acceptances
     FOR SELECT TO authenticated USING (user_id = auth.uid());
   ```

### עדיפות בינונית

3. **`profiles`** — הוסף policy מניעת UPDATE לשדות `role` ו-`is_active` ע"י user עצמו

4. **`authorized_phones`** — הוסף policy: **אין INSERT/UPDATE/DELETE ל-authenticated**; רק service_role

### עדיפות נמוכה (multi-tenant בעתיד)

5. כל טבלאות ישויות — לשקול policy שמגביל גישה לפי `organization_id` (טרם קיים)

---

## פעולות מיידיות

- [ ] אמת ב-Supabase Dashboard: `vehicles`, `vehicle_licenses`, `vehicle_insurances`, `heavy_equipment_insurances`, `manager_licenses` — האם RLS מופעל?
- [ ] אם לא — הפעל RLS ויצור policies (כחלק ממיגרציה שלב יד׳)
- [ ] ודא `profiles` — האם יש UPDATE/INSERT policies?

---

*לביצוע שינויים ב-RLS יש לכלול ב-migration שלב יד׳ ולא להריץ ידנית.*
