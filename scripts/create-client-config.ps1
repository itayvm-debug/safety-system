<#
.SYNOPSIS
    SafeDoc — יצירת קובץ .env.local ללקוח חדש
.DESCRIPTION
    אינטרקטיבי — שואל שאלות ומייצר קובץ .env.local
    לשימוש בהקמת environment חדש ללקוח.
.PARAMETER OutputFile
    שם קובץ הפלט (default: .env.local.new)
.EXAMPLE
    .\create-client-config.ps1
    .\create-client-config.ps1 -OutputFile ".env.local.client-acme"
#>

param(
    [string]$OutputFile = ".env.local.new"
)

Write-Host "=== SafeDoc — יצירת קונפיגורציה ללקוח חדש ===" -ForegroundColor Cyan
Write-Host ""

function Prompt-Value($question, $required = $false, $secret = $false) {
    $prompt = if ($required) { "$question (*): " } else { "$question: " }
    if ($secret) {
        $val = Read-Host -Prompt $prompt -AsSecureString
        return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($val)
        )
    } else {
        return Read-Host -Prompt $prompt
    }
}

# Supabase
Write-Host "--- Supabase ---" -ForegroundColor Yellow
$supabaseUrl  = Prompt-Value "NEXT_PUBLIC_SUPABASE_URL (https://xxx.supabase.co)" $true
$anonKey      = Prompt-Value "NEXT_PUBLIC_SUPABASE_ANON_KEY" $true
$serviceKey   = Prompt-Value "SUPABASE_SERVICE_ROLE_KEY (סודי!)" $true $true

# App
Write-Host ""
Write-Host "--- App ---" -ForegroundColor Yellow
$appUrl        = Prompt-Value "NEXT_PUBLIC_APP_URL (https://safedoc-xxx.vercel.app)" $true
$sessionSecret = Prompt-Value "SESSION_SECRET (openssl rand -base64 64)" $true $true

# Customer
Write-Host ""
Write-Host "--- פרטי הלקוח ---" -ForegroundColor Yellow
$custName     = Prompt-Value "NEXT_PUBLIC_CUSTOMER_NAME (שם בעברית)" $true
$custNameEn   = Prompt-Value "NEXT_PUBLIC_CUSTOMER_NAME_EN"
$custReg      = Prompt-Value "NEXT_PUBLIC_CUSTOMER_REG (ח.פ./ע.מ.)"
$custAddr     = Prompt-Value "NEXT_PUBLIC_CUSTOMER_ADDRESS"
$custPhone    = Prompt-Value "NEXT_PUBLIC_CUSTOMER_PHONE"
$custEmail    = Prompt-Value "NEXT_PUBLIC_CUSTOMER_EMAIL"
$custSafety   = Prompt-Value "NEXT_PUBLIC_CUSTOMER_SAFETY_EMAIL"
$reportEmail  = Prompt-Value "REPORT_TO_EMAIL (אימייל לדוחות שבועיים)"

# Optional
Write-Host ""
Write-Host "--- אופציונלי ---" -ForegroundColor Yellow
$resendKey     = Prompt-Value "RESEND_API_KEY (לשליחת דוחות)"
$anthropicKey  = Prompt-Value "ANTHROPIC_API_KEY (לAI)"

# Build env file content
$envContent = @"
# SafeDoc Client Configuration
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# Customer: $custName
# ⚠️  NEVER commit this file to git

# Supabase
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anonKey
SUPABASE_SERVICE_ROLE_KEY=$serviceKey

# App
NEXT_PUBLIC_APP_URL=$appUrl
SESSION_SECRET=$sessionSecret

# Customer Identity
NEXT_PUBLIC_CUSTOMER_NAME=$custName
NEXT_PUBLIC_CUSTOMER_NAME_EN=$custNameEn
NEXT_PUBLIC_CUSTOMER_REG=$custReg
NEXT_PUBLIC_CUSTOMER_ADDRESS=$custAddr
NEXT_PUBLIC_CUSTOMER_PHONE=$custPhone
NEXT_PUBLIC_CUSTOMER_EMAIL=$custEmail
NEXT_PUBLIC_CUSTOMER_SAFETY_EMAIL=$custSafety
REPORT_TO_EMAIL=$reportEmail
"@

if ($resendKey) { $envContent += "`nRESEND_API_KEY=$resendKey" }
if ($anthropicKey) { $envContent += "`nANTHROPIC_API_KEY=$anthropicKey" }

# Write file
$envContent | Out-File -FilePath $OutputFile -Encoding utf8 -NoNewline
Write-Host ""
Write-Host "✅ קובץ נוצר: $OutputFile" -ForegroundColor Green
Write-Host "⚠️  ודא שקובץ זה לא ייכנס ל-git!" -ForegroundColor Red
Write-Host ""
Write-Host "לשלבים הבאים: ראה docs/client-template/VERCEL_SETUP_CHECKLIST_HE.md"
