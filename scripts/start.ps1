Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

docker compose up -d --build

Write-Host ""
Write-Host "StackIQ is starting:"
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:4000"
Write-Host "Health:   http://localhost:4000/health"
