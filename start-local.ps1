$ErrorActionPreference = "Stop"
$repo = $PSScriptRoot
$node = (Get-Command node).Source
$logs = Join-Path $repo "backend/.data/logs"
New-Item -ItemType Directory -Force $logs | Out-Null
function Start-LocalService($name, $port, $directory, $arguments) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "$name already has a listener on port $port"
    return
  }
  Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$name.log") -RedirectStandardError (Join-Path $logs "$name.error.log") -PassThru | ForEach-Object {
    @{pid=$_.Id;started=$_.StartTime.ToUniversalTime().ToString("o");repo=$repo;arguments=$arguments} | ConvertTo-Json | Set-Content (Join-Path $logs "$name.pid.json")
  }
}
Start-LocalService "postgres" 5433 (Join-Path $repo "backend") @("scripts/local-postgres.mjs")
for ($i=0; $i -lt 60; $i++) {
  if (Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue) { break }
  Start-Sleep -Milliseconds 500
}
if (-not (Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue)) { throw "PostgreSQL did not start; check backend/.data/logs" }
$env:PORT = "5001"
Start-LocalService "api" 5001 (Join-Path $repo "backend") @("src/server.js")
Start-LocalService "frontend" 5174 (Join-Path $repo "frontend") @("node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5174", "--strictPort")
Write-Host "Website: http://127.0.0.1:5174"
Write-Host "API: http://127.0.0.1:5001/api/health"
Write-Host "Logs: $logs"
