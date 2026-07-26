# Batch 2 — מודל Ownership לטבלות ילד: vehicle_licenses ו-vehicle_insurances

## רקע

ב-Batch 2, טבלות `vehicle_licenses` ו-`vehicle_insurances` **לא** קיבלו `company_id` ישיר.

**הסיבה:** רצינו לשמור על scope מינימלי ל-Batch 2 (subcontractors + vehicles בלבד) ולאפשר Batch 3 להתמקד בטבלות ילד. האבטחה נשמרת דרך chain של ownership.

---

## מודל Ownership דרך Parent Vehicle

```
vehicle_licenses.vehicle_id → vehicles.id
vehicles.company_id = <current_company>
```

```
vehicle_insurances.vehicle_id → vehicles.id
vehicles.company_id = <current_company>
```

**כלל:** גישה ל-vehicle_license מורשית אם ורק אם ה-vehicle המשויך שייך לחברה של המשתמש.

---

## אכיפה בשכבות

### שכבת DB (RLS)

RLS על `vehicle_licenses` ו-`vehicle_insurances` נשאר blanket-authenticated לעת עתה (כמו לפני Batch 2), **אך** RLS על `vehicles` כבר company-scoped. מאחר שכל הגישות עוברות דרך service_role, RLS היא defense-in-depth.

Batch 3 יחליף גם את RLS של הטבלות הילד.

### שכבת API (`/api/vehicle-licenses`, `/api/vehicle-insurances`)

**GET** (by `vehicle_id`):
```typescript
// 1. וודא vehicle שייך לחברה
const { data: vehicle } = await supabase
  .from('vehicles').select('id')
  .eq('id', vehicleId).eq('company_id', companyId).maybeSingle();
if (!vehicle) return 404;

// 2. רק אז שלוף את הרשיונות
supabase.from('vehicle_licenses').select('*').eq('vehicle_id', vehicleId);
```

**POST** (new license/insurance):
```typescript
// וודא שה-vehicle_id שסופק שייך לחברה
const { data: vehicle } = await supabase
  .from('vehicles').select('id')
  .eq('id', vehicle_id).eq('company_id', companyId).maybeSingle();
if (!vehicle) return 404;
```

**PATCH/DELETE** (by license/insurance ID):
```typescript
// שלב 1: שלוף את הרשומה
const { data: record } = await supabase
  .from('vehicle_licenses').select('id, vehicle_id').eq('id', id).maybeSingle();
if (!record) return 404;

// שלב 2: וודא parent vehicle שייך לחברה
const { data: vehicle } = await supabase
  .from('vehicles').select('id')
  .eq('id', record.vehicle_id).eq('company_id', companyId).maybeSingle();
if (!vehicle) return 404;
```

---

### שכבת Storage Authorization

Storage URL לקבצי `vehicle_licenses.file_url` ו-`vehicle_insurances.file_url` מאומתת דרך **Mode B-vehicle** ב-`lib/storage/authorize.ts`:

```typescript
// vehicle IDs לחברה הנוכחית (מ-Mode A)
const vehicleIds = companyVehicles.map(v => v.id);

if (vehicleIds.length > 0) {
  const vehicleChildChecks = await Promise.all([
    supabase.from('vehicle_licenses')
      .select('id').eq('file_url', path)
      .in('vehicle_id', vehicleIds).limit(1).maybeSingle()
      .then(r => r.data ? 'vehicle_licenses' : null),
    supabase.from('vehicle_insurances')
      .select('id').eq('file_url', path)
      .in('vehicle_id', vehicleIds).limit(1).maybeSingle()
      .then(r => r.data ? 'vehicle_insurances' : null),
  ]);
  // ...
}
```

**ניתוח:** בדיקה זו מוודאת ש-URL משויך לרשיון/ביטוח של רכב שמשויך לחברה. חברה ב' לא יכולה לגשת לקבצי חברה א'.

---

## Export

כרגע `vehicle_licenses` ו-`vehicle_insurances` נשארים ב-`GLOBAL_TABLES` ב-`exportTables.ts` — **זמני**.

**הסיבה:** לא ניתן לסנן אותן ישירות לפי company_id (אין עמודה כזאת). סינון דרך JOIN נדרש ב-Batch 3.

**Batch 3 יוסיף:** column `company_id` ישיר + יעביר לסינון ישיר.

**סיכון עד Batch 3:** ייצוא כולל את `vehicle_licenses` ו-`vehicle_insurances` של כל החברות. זהו ממצא ידוע ומתועד. המנהל צריך להיות מודע לכך.

---

## גבולות הגזרה של המודל הזמני

| גישה | מוגן? | הערה |
|---|---|---|
| GET license/insurance by vehicle_id | ✅ | בדיקת parent vehicle ownership |
| POST license/insurance | ✅ | בדיקת parent vehicle ownership |
| PATCH license/insurance by ID | ✅ | chain: record → vehicle_id → company_id |
| DELETE license/insurance by ID | ✅ | chain: record → vehicle_id → company_id |
| Storage signed URL (file_url) | ✅ | Mode B-vehicle |
| Export (vehicle_licenses, vehicle_insurances) | ⚠️ | גלובלי עד Batch 3 |
| RLS (defense-in-depth) | ⚠️ | blanket עד Batch 3 |

---

## Batch 3 — תוכנית לטבלות ילד

ב-Batch 3:
1. `vehicle_licenses` — הוספת `company_id UUID NOT NULL FK → companies(id)`
2. `vehicle_insurances` — הוספת `company_id UUID NOT NULL FK → companies(id)`
3. backfill מ-parent vehicle
4. RLS company-scoped
5. export לסינון ישיר
6. authorize.ts — העברה מ-Mode B-vehicle ל-Mode A ישיר

באותו batch יש לשקול גם:
- `heavy_equipment` — company_id
- `lifting_equipment` — company_id
- `heavy_equipment_insurances` — company_id (דרך parent)
- `safety_briefings` — company_id
- `height_restrictions` — company_id (דרך parent worker)
