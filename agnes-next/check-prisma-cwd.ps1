# Guard script: Ensures Prisma commands are run from agnes-next root
# Usage: .\check-prisma-cwd.ps1

$expectedDir = "agnes-next"
$currentDir = Split-Path -Leaf (Get-Location)

if ($currentDir -ne $expectedDir) {
    Write-Host "❌ ERROR: Prisma commands must be run from agnes-next root directory" -ForegroundColor Red
    Write-Host "Current directory: $currentDir" -ForegroundColor Yellow
    Write-Host "Expected directory: $expectedDir" -ForegroundColor Yellow
    Write-Host "`nRun: cd C:\dev\agnes-app\agnes-next" -ForegroundColor Cyan
    exit 1
}

# Check if prisma/dev-next.db exists (wrong location indicator)
if (Test-Path "prisma\dev-next.db") {
    Write-Host "⚠️  WARNING: Found prisma/dev-next.db - Prisma was run from wrong directory!" -ForegroundColor Yellow
    Write-Host "The DB should be in root: dev-next.db" -ForegroundColor Yellow
    Write-Host "If you see this, delete prisma/dev-next.db and re-run from root." -ForegroundColor Yellow
}

Write-Host "✅ Running from correct directory: $currentDir" -ForegroundColor Green
exit 0
