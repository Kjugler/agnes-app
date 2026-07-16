# Option A: isolated Jody staging on Railway (run after: railway login)
# Usage (from repo root):
#   .\deepquill\scripts\setup-jody-railway-staging.ps1 -PreviewSiteUrl "https://deep-quill-XXXX.vercel.app"
#
# Requires: Railway CLI, production deepquill env values for copy (Stripe, Mailchimp, FULFILLMENT_TOKEN_SECRET).
# Does NOT modify production Railway service or production Postgres.

param(
  [Parameter(Mandatory = $true)]
  [string]$PreviewSiteUrl,
  [string]$ServiceName = "deepquill-jody-preview",
  [string]$DeployBranch = "test/jody-phase1-preview"
)

$ErrorActionPreference = "Stop"
$PreviewSiteUrl = $PreviewSiteUrl.Trim().TrimEnd("/")

Write-Host "=== Jody Railway staging setup ===" -ForegroundColor Cyan
Write-Host "Service: $ServiceName"
Write-Host "Branch:  $DeployBranch"
Write-Host "SITE_URL: $PreviewSiteUrl"
Write-Host ""

railway whoami | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Run 'railway login' first."
}

Push-Location (Join-Path $PSScriptRoot "..")

Write-Host "[1/6] Initialize / link Railway project (select or create $ServiceName)..."
railway link

Write-Host "[2/6] Add isolated Postgres plugin (new database — not production)..."
railway add -d postgres

Write-Host "[3/6] Set staging variables (confirm DATABASE_URL references NEW Postgres)..."
railway variables set "SITE_URL=$PreviewSiteUrl"
railway variables set "TRANSACTIONAL_EMAIL_ENABLED=1"
Write-Host "Set manually if not copied from prod: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,"
Write-Host "  MAILCHIMP_TRANSACTIONAL_KEY, MAILCHIMP_FROM_EMAIL, FULFILLMENT_TOKEN_SECRET,"
Write-Host "  STRIPE_PRICE_*, ADMIN_KEY, EBOOK_FILE_URL, etc."

Write-Host "[4/6] Deploy from GitHub branch $DeployBranch (Railway dashboard: Connect Repo, branch, Root Directory = deepquill)..."
Write-Host "      start command: npm start (runs prisma migrate deploy on boot)"

Write-Host "[5/6] After deploy, verify:"
Write-Host "  curl https://<staging-host>/ping"
Write-Host "  curl -X POST https://<staging-host>/api/jody/remember/request -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\",\"chapterId\":\"1\"}'"

Write-Host "[6/6] Vercel preview branch override (test/jody-phase1-preview only):"
Write-Host "  cd agnes-next"
Write-Host "  npx vercel env add DEEPQUILL_URL preview $DeployBranch --value https://<staging-host>"
Write-Host "  npx vercel env add NEXT_PUBLIC_API_BASE_URL preview $DeployBranch --value https://<staging-host>"
Write-Host "  git commit --allow-empty -m 'redeploy jody preview' && git push origin $DeployBranch"

Pop-Location
Write-Host "Done (manual steps remain for secret copy and GitHub connect)." -ForegroundColor Green
