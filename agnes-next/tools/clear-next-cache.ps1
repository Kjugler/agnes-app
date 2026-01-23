# PowerShell script to clear Next.js .next cache
# Usage: .\tools\clear-next-cache.ps1

Write-Host "Clearing Next.js cache (.next directory)..."

if (Test-Path .next) {
    Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
    Write-Host "✅ Cleared .next directory"
} else {
    Write-Host "ℹ️  .next directory does not exist (nothing to clear)"
}
