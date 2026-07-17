# Configure deepquill-jody-preview on Railway using reference variables from agnes-app.
# Does NOT modify production service variables or expose secret values.
#
# Prerequisites:
#   railway login
#   railway link   (from repo root or deepquill — same Railway project as agnes-app)
#   Volume on deepquill-jody-preview mounted at /data
#
# Usage:
#   .\deepquill\scripts\configure-jody-railway-preview.ps1 -PreviewSiteUrl "https://deep-quill-xxxx.vercel.app"
#   .\deepquill\scripts\configure-jody-railway-preview.ps1 -PreviewSiteUrl "https://..." -DryRun

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https?://')]
  [string]$PreviewSiteUrl,

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$PreviewService = 'deepquill-jody-preview'
$ProdService = 'agnes-app'

$LiteralVariables = [ordered]@{
  DATABASE_URL                 = 'file:/data/jody-preview.db'
  SITE_URL                     = $null  # filled after trim
  TRANSACTIONAL_EMAIL_ENABLED  = '1'
  NODE_ENV                     = 'production'
}

$ReferenceVariableKeys = @(
  'STRIPE_SECRET_KEY'
  'MAILCHIMP_TRANSACTIONAL_KEY'
  'MAILCHIMP_FROM_EMAIL'
  'MAILCHIMP_FROM_NAME'
  'FULFILLMENT_TOKEN_SECRET'
  'ADMIN_KEY'
)

function Write-Info([string]$Message) {
  Write-Host $Message -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host $Message -ForegroundColor Green
}

function Write-Warn([string]$Message) {
  Write-Host $Message -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
}

function Test-RailwayCliInstalled {
  return $null -ne (Get-Command railway -ErrorAction SilentlyContinue)
}

function Test-RailwayLoggedIn {
  $null = railway whoami 2>&1
  return $LASTEXITCODE -eq 0
}

function Test-RailwayProjectLinked {
  $output = railway status 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  if ($output -match 'No linked project') {
    return $false
  }
  return $true
}

function Test-RailwayServiceExists([string]$ServiceName) {
  # Exit code only — discard output so secrets are never printed for production.
  $null = railway variable list -s $ServiceName 2>&1
  return $LASTEXITCODE -eq 0
}

function Get-ReferenceValue([string]$ProdServiceName, [string]$Key) {
  return ('${{{0}.{1}}}' -f $ProdServiceName, $Key)
}

function Set-RailwayReferenceVariable {
  param(
    [string]$ServiceName,
    [string]$Key,
    [string]$ReferenceValue
  )

  if ($DryRun) {
    Write-Warn "[DRY RUN] Would set $Key=$ReferenceValue on $ServiceName"
    return
  }

  $ReferenceValue | railway variable set $Key --stdin -s $ServiceName --skip-deploys 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set reference variable '$Key' on '$ServiceName'."
  }
  Write-Ok "Set $Key -> $ReferenceValue"
}

function Set-RailwayLiteralVariable {
  param(
    [string]$ServiceName,
    [string]$Key,
    [string]$Value
  )

  if ($DryRun) {
    Write-Warn "[DRY RUN] Would set $Key=$Value on $ServiceName"
    return
  }

  railway variable set "${Key}=${Value}" -s $ServiceName --skip-deploys 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set literal variable '$Key' on '$ServiceName'."
  }
  Write-Ok "Set $Key=$Value"
}

# --- main ---

$PreviewSiteUrl = $PreviewSiteUrl.Trim().TrimEnd('/')
$LiteralVariables['SITE_URL'] = $PreviewSiteUrl

Write-Info '=== Jody Railway preview configuration ==='
Write-Info "Preview service:     $PreviewService"
Write-Info "Reference service:   $ProdService (read-only; not modified)"
Write-Info "SITE_URL:            $PreviewSiteUrl"
if ($DryRun) {
  Write-Warn 'Mode: DRY RUN (no Railway changes will be made)'
}
Write-Host ''

if (-not (Test-RailwayCliInstalled)) {
  Write-Err 'Railway CLI is not installed.'
  Write-Host 'Install: https://docs.railway.com/develop/cli'
  exit 1
}
Write-Ok 'Railway CLI found.'

if (-not (Test-RailwayLoggedIn)) {
  Write-Err 'Not logged in to Railway.'
  Write-Host 'Run: railway login'
  exit 1
}
Write-Ok 'Railway login verified.'

if (-not (Test-RailwayProjectLinked)) {
  Write-Err 'No Railway project linked in this directory.'
  Write-Host 'From the repo root run: railway link'
  Write-Host 'Then select the project that contains agnes-app and deepquill-jody-preview.'
  exit 1
}
Write-Ok 'Railway project link verified.'

if (-not (Test-RailwayServiceExists -ServiceName $ProdService)) {
  Write-Err "Production reference service '$ProdService' was not found in the linked project."
  Write-Host 'Check the exact service name in the Railway dashboard (Settings -> Service name).'
  exit 1
}
Write-Ok "Reference service '$ProdService' exists."

if (-not (Test-RailwayServiceExists -ServiceName $PreviewService)) {
  Write-Err "Preview service '$PreviewService' was not found in the linked project."
  Write-Host 'Create the service in Railway first, then re-run this script.'
  exit 1
}
Write-Ok "Preview service '$PreviewService' exists."

Write-Host ''
Write-Info 'Configuring preview-only literals on deepquill-jody-preview...'
foreach ($entry in $LiteralVariables.GetEnumerator()) {
  Set-RailwayLiteralVariable -ServiceName $PreviewService -Key $entry.Key -Value $entry.Value
}

Write-Host ''
Write-Info "Configuring reference variables from $ProdService (secrets stay on production)..."
foreach ($key in $ReferenceVariableKeys) {
  $ref = Get-ReferenceValue -ProdServiceName $ProdService -Key $key
  Set-RailwayReferenceVariable -ServiceName $PreviewService -Key $key -ReferenceValue $ref
}

Write-Host ''
if ($DryRun) {
  Write-Warn "[DRY RUN] Would redeploy $PreviewService once (skipped)."
  Write-Ok 'Dry run complete. Re-run without -DryRun to apply changes.'
  exit 0
}

Write-Info "Redeploying $PreviewService (single deploy after all variables)..."
railway service redeploy -s $PreviewService -y 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Err "Redeploy failed for '$PreviewService'."
  Write-Host 'Variables were set; check the Railway dashboard and redeploy manually if needed.'
  exit 1
}

Write-Host ''
Write-Ok 'Success! deepquill-jody-preview is configured and redeploying.'
Write-Host 'Next steps:'
Write-Host "  1. Confirm deploy logs show DATABASE_URL=file:/data/jody-preview.db"
Write-Host "  2. GET  https://<staging-host>/ping  -> pong"
Write-Host "  3. POST https://<staging-host>/api/jody/remember/request  (should not 404)"
Write-Host '  4. Set Vercel branch overrides DEEPQUILL_URL / NEXT_PUBLIC_API_BASE_URL for test/jody-phase1-preview'
