Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

docker compose rm -sfv frontend
docker compose up -d --build frontend

Write-Host ""
Write-Host "Frontend clean-started successfully:"
Write-Host "Frontend: http://localhost:5173"
