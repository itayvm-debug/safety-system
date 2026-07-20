<#
.SYNOPSIS
    SafeDoc — אימות קבצי גיבוי
.DESCRIPTION
    מאמת שקבצי גיבוי קיימים ותקינים לפי manifest.
.PARAMETER BackupDir
    תיקיית הגיבוי לאימות
.EXAMPLE
    .\verify-backup.ps1 -BackupDir "C:\Backups\safedoc"
#>

param(
    [Parameter(Mandatory)]
    [string]$BackupDir
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
    Write-Error "תיקיית גיבוי לא נמצאה: $BackupDir"
    exit 1
}

Write-Host "🔍 SafeDoc Backup Verification"
Write-Host "Directory: $BackupDir"
Write-Host ""

$allFiles = Get-ChildItem -Path $BackupDir -File
$errors = 0

# Check metadata files
$dbMetadata = $allFiles | Where-Object { $_.Name -like "db-metadata-*.json" }
if ($dbMetadata.Count -eq 0) {
    Write-Host "⚠️  לא נמצא קובץ db-metadata"
    $errors++
} else {
    $latest = $dbMetadata | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Host "✅ DB Metadata: $($latest.Name)"

    try {
        $meta = Get-Content $latest.FullName | ConvertFrom-Json
        Write-Host "   Timestamp: $($meta.timestamp)"
        Write-Host "   Tables: $($meta.tables.PSObject.Properties.Count)"
        $meta.tables.PSObject.Properties | ForEach-Object {
            $rows = $_.Value.rowCount
            $status = if ($rows -ge 0) { "✓" } else { "⚠" }
            Write-Host "   $status $($_.Name): $rows rows"
        }
    } catch {
        Write-Host "   ❌ שגיאה בקריאת metadata: $($_.Exception.Message)"
        $errors++
    }
}

# Check storage manifest
$storageMeta = $allFiles | Where-Object { $_.Name -like "storage-manifest-*.json" }
if ($storageMeta.Count -eq 0) {
    Write-Host "⚠️  לא נמצא קובץ storage-manifest"
    $errors++
} else {
    $latest = $storageMeta | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Host "✅ Storage Manifest: $($latest.Name)"

    try {
        $meta = Get-Content $latest.FullName | ConvertFrom-Json
        Write-Host "   Bucket: $($meta.bucketName)"
        Write-Host "   Top-level items: $($meta.fileCount)"
    } catch {
        Write-Host "   ❌ שגיאה: $($_.Exception.Message)"
        $errors++
    }
}

# Check export ZIPs
$zips = $allFiles | Where-Object { $_.Name -like "safedoc-export-*.zip" }
if ($zips.Count -gt 0) {
    Write-Host ""
    Write-Host "📦 Export ZIPs:"
    $zips | Sort-Object LastWriteTime -Descending | ForEach-Object {
        $sizeMB = [Math]::Round($_.Length / 1MB, 2)
        Write-Host "   ✅ $($_.Name) ($sizeMB MB)"
    }
}

Write-Host ""
if ($errors -eq 0) {
    Write-Host "✅ אימות הושלם — אין שגיאות"
    exit 0
} else {
    Write-Host "❌ נמצאו $errors שגיאות"
    exit 1
}
