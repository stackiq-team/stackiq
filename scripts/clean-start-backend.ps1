Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

docker compose rm -sfv backend
docker compose up -d db redis
docker compose run --rm backend npm run db:migrate
docker compose up -d --build backend

Write-Host ""
Write-Host "Backend clean-started successfully:"
Write-Host "Backend: http://localhost:4000"
Write-Host "Health:  http://localhost:4000/health"
