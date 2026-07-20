<#
.SYNOPSIS
    SafeDoc — בדיקת מטה-דאטה של בסיס הנתונים (אינו גיבוי!)
.DESCRIPTION
    שולח שאילתות REST ל-Supabase ומייצא metadata: שמות טבלאות + row counts.
    ⚠️  סקריפט זה אינו מגבה נתונים. הוא מייצר metadata בלבד.
    לגיבוי אמיתי: Supabase Dashboard → Settings → Database → Backups (PITR, Pro plan).
.PARAMETER OutputDir
    תיקייה לשמירת קובץ המטה-דאטה (default: ./backups)
.EXAMPLE
    .\inspect-database-metadata.ps1 -OutputDir "C:\Backups\safedoc"
#>

param(
    [string]$OutputDir = ".\backups"
)

$ErrorActionPreference = "Stop"

# Validate env vars
$supabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL
$serviceKey  = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $supabaseUrl -or -not $serviceKey) {
    Write-Error "חסרים: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
    exit 1
}

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$outFile = Join-Path $OutputDir "db-metadata-$timestamp.json"

Write-Host "📦 SafeDoc Database Backup — $timestamp"
Write-Host "Supabase URL: $supabaseUrl"

# Query table row counts via REST API
$headers = @{
    "apikey"        = $serviceKey
    "Authorization" = "Bearer $serviceKey"
    "Content-Type"  = "application/json"
}

$tables = @(
    "workers", "documents", "vehicles", "vehicle_licenses", "vehicle_insurances",
    "heavy_equipment", "heavy_equipment_insurances", "lifting_equipment",
    "lifting_machine_appointments", "subcontractors", "safety_briefings",
    "height_restrictions", "entity_notes", "profiles", "authorized_phones",
    "legal_acceptances", "audit_logs"
)

$metadata = @{
    timestamp    = $timestamp
    supabaseUrl  = $supabaseUrl
    tables       = @{}
    note         = "מטה-דאטה בלבד. לגיבוי מלא — השתמש ב-Supabase Dashboard -> Settings -> Backups"
}

foreach ($table in $tables) {
    try {
        $url = "$supabaseUrl/rest/v1/$table`?select=count"
        Invoke-RestMethod -Uri $url -Headers $headers -Method Head -ResponseHeadersVariable respHeaders | Out-Null
        $count = $respHeaders["Content-Range"] -replace ".*/", ""
        $metadata.tables[$table] = @{ rowCount = [int]$count }
        Write-Host "  ✓ $table — $count rows"
    } catch {
        $metadata.tables[$table] = @{ rowCount = -1; error = $_.Exception.Message }
        Write-Host "  ⚠ $table — שגיאה: $($_.Exception.Message)"
    }
}

# Write metadata
$metadata | ConvertTo-Json -Depth 5 | Out-File -FilePath $outFile -Encoding utf8
Write-Host ""
Write-Host "✅ Metadata saved: $outFile"
Write-Host ""
Write-Host "⚠️  לגיבוי מלא של DB:"
Write-Host "   1. Supabase Dashboard → Settings → Database → Backups"
Write-Host "   2. או: Supabase Dashboard → Settings → Database → Restore (PITR)"
