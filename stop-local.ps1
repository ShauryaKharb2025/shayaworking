param([switch]$KeepDatabase)
$ErrorActionPreference = "Stop"
$repo = $PSScriptRoot
$logs = Join-Path $repo "backend/.data/logs"
foreach ($name in @("frontend", "api", "postgres")) {
  if ($name -eq "postgres" -and $KeepDatabase) { continue }
  $record = Join-Path $logs "$name.pid.json"
  if (-not (Test-Path -LiteralPath $record)) { Write-Host "$name has no tracked process; left unchanged"; continue }
  $saved = Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
  $process = Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  if ($saved.repo -ne $repo -or $process.StartTime.ToUniversalTime().ToString("o") -ne $saved.started) { throw "$name process identity changed; refusing to stop it" }
  if ($name -eq "postgres") {
    $pgctl = Join-Path $repo "backend/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"
    & $pgctl stop -D (Join-Path $repo "backend/.data/postgres") -m fast -w
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL did not stop cleanly" }
  }
  Stop-Process -Id $saved.pid -ErrorAction SilentlyContinue
  Write-Host "Stopped $name"
}
