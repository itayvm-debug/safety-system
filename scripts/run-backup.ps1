# SafeDoc - weekly local backup, run by the Windows scheduled task "SafeDoc weekly backup".
# Runs `npm run backup` from the project folder, appends the output to
# <backup folder>\backup.log and pops up a message only if the backup failed.
# ASCII only on purpose: Windows PowerShell 5.1 misreads non-ASCII .ps1 files without a BOM.
# Setup / removal: docs/operations/BACKUP_AND_RECOVERY_RUNBOOK_HE.md

$ErrorActionPreference = 'Continue'
$project = Split-Path -Parent $PSScriptRoot
$backupDir = if ($env:SAFEDOC_BACKUP_DIR) { $env:SAFEDOC_BACKUP_DIR } else { Join-Path $env:USERPROFILE 'SafeDoc-Backups' }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$log = Join-Path $backupDir 'backup.log'

Set-Location $project
# node prints UTF-8; without this PowerShell decodes it with the OEM code page and Hebrew is garbled.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
"===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Out-File -FilePath $log -Append -Encoding utf8
$output = & cmd.exe /d /c "npm.cmd run backup 2>&1"
$code = $LASTEXITCODE
$output | Out-File -FilePath $log -Append -Encoding utf8
"exit code: $code" | Out-File -FilePath $log -Append -Encoding utf8

if ($code -ne 0) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "SafeDoc backup FAILED (exit code $code).`nDetails: $log",
        'SafeDoc backup', 'OK', 'Error') | Out-Null
}
exit $code
