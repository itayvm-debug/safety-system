-- ================================================================
-- Orphan file candidates in bucket worker-files (READ ONLY, P1-6)
-- Lists objects that no row in any table references. Do NOT delete from this
-- list automatically: review it, keep anything under legal retention, and
-- delete in a separate, approved step.
-- Objects younger than 2 days are excluded (may belong to a form still open).
-- ================================================================
WITH referenced AS (
  SELECT photo_url AS path FROM workers
  UNION SELECT file_url FROM documents
  UNION SELECT file_url FROM safety_briefings
  UNION SELECT signature_url FROM safety_briefings
  UNION SELECT file_url FROM height_restrictions
  UNION SELECT signature_url FROM height_restrictions
  UNION SELECT file_url FROM professional_licenses
  UNION SELECT file_url FROM manager_licenses
  UNION SELECT operator_signature_url FROM lifting_machine_appointments
  UNION SELECT appointer_signature_url FROM lifting_machine_appointments
  UNION SELECT pdf_url FROM lifting_machine_appointments
  UNION SELECT image_url FROM vehicles
  UNION SELECT file_url FROM vehicle_licenses
  UNION SELECT file_url FROM vehicle_insurances
  UNION SELECT image_url FROM heavy_equipment
  UNION SELECT license_file_url FROM heavy_equipment
  UNION SELECT inspection_file_url FROM heavy_equipment
  UNION SELECT insurance_file_url FROM heavy_equipment
  UNION SELECT file_url FROM heavy_equipment_insurances
  UNION SELECT image_url FROM lifting_equipment
  UNION SELECT inspection_file_url FROM lifting_equipment
  UNION SELECT logo_url FROM companies
  UNION SELECT settings -> 'branding' ->> 'logoUrl' FROM companies
),
candidates AS (
  SELECT o.name,
         split_part(o.name, '/', 1)      AS folder,
         (o.metadata ->> 'size')::bigint AS size_bytes,
         o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'worker-files'
    AND o.created_at < now() - interval '2 days'
    AND NOT EXISTS (SELECT 1 FROM referenced r WHERE r.path = o.name)
)
-- Summary by folder (run the detailed list below separately if needed)
SELECT folder, count(*) AS objects, pg_size_pretty(sum(size_bytes)) AS total_size,
       min(created_at) AS oldest, max(created_at) AS newest
FROM candidates
GROUP BY folder
ORDER BY objects DESC;

-- Detailed list:
-- SELECT * FROM candidates ORDER BY created_at;   (paste the CTEs above before it)
