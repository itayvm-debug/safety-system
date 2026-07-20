<#
.SYNOPSIS
    SafeDoc — יצירת Manifest של Supabase Storage (אינו גיבוי!)
.DESCRIPTION
    מייצא רשימת תיקיות ב-bucket worker-files.
    ⚠️  סקריפט זה אינו מוריד קבצים. הוא יוצר manifest (רשימה) בלבד.
    לגיבוי אמיתי של קבצים: הורד כל קובץ בנפרד דרך Signed URL מ-Supabase Dashboard.
.PARAMETER OutputDir
    תיקייה לשמירת קובץ ה-manifest
.EXAMPLE
    .\create-storage-manifest.ps1 -OutputDir "C:\Backups\safedoc"
#>

param(
    [string]$OutputDir  = ".\backups",
    [string]$BucketName = "worker-files"
)

$ErrorActionPreference = "Stop"

$supabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL
$serviceKey  = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $supabaseUrl -or -not $serviceKey) {
    Write-Error "חסרים: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
    exit 1
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$manifestFile = Join-Path $OutputDir "storage-manifest-$timestamp.json"

$headers = @{
    "apikey"        = $serviceKey
    "Authorization" = "Bearer $serviceKey"
    "Content-Type"  = "application/json"
}

Write-Host "📦 SafeDoc Storage Backup — $timestamp"
Write-Host "Bucket: $BucketName"

# List all files in bucket
$listUrl = "$supabaseUrl/storage/v1/object/list/$BucketName"
$body = @{ prefix = ""; limit = 100; offset = 0 } | ConvertTo-Json

try {
    $files = Invoke-RestMethod -Uri $listUrl -Headers $headers -Method Post -Body $body
} catch {
    Write-Error "שגיאה בגישה ל-Storage: $($_.Exception.Message)"
    exit 1
}

Write-Host "נמצאו $($files.Count) קבצים ברמה ראשונה"

$manifest = @{
    timestamp    = $timestamp
    bucketName   = $BucketName
    supabaseUrl  = $supabaseUrl
    topLevelFolders = @()
    fileCount    = 0
    note         = "Manifest של תיקיות ב-Storage. קבצים בודדים בתוך תיקיות — הרץ שוב לכל תיקייה."
}

foreach ($item in $files) {
    $manifest.topLevelFolders += $item.name
}
$manifest.fileCount = $files.Count

$manifest | ConvertTo-Json -Depth 5 | Out-File -FilePath $manifestFile -Encoding utf8

Write-Host ""
Write-Host "✅ Storage manifest saved: $manifestFile"
Write-Host ""
Write-Host "ℹ️  לגיבוי מלא של קבצים:"
Write-Host "   לכל תיקייה, הרץ: POST /storage/v1/object/list/$BucketName עם prefix=תיקייה/"
Write-Host "   ולאחר מכן הורד כל קובץ דרך Signed URL"
