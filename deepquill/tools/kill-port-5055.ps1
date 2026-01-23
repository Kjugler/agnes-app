# deepquill/tools/kill-port-5055.ps1
# Helper script to kill any process listening on port 5055
# Usage: .\tools\kill-port-5055.ps1

$port = 5055
Write-Host "Checking for processes on port $port..."

$connections = netstat -ano | Select-String ":$port" | Select-String "LISTENING"

if ($connections) {
    foreach ($conn in $connections) {
        $pid = ($conn -split '\s+')[-1]
        if ($pid -match '^\d+$') {
            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Found process: $($process.ProcessName) (PID: $pid)"
                Write-Host "Killing process $pid..."
                taskkill /PID $pid /F
                Write-Host "✅ Process killed"
            }
        }
    }
} else {
    Write-Host "No process found listening on port $port"
}
