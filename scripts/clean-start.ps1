Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

docker compose down -v
docker compose up -d --build db redis
docker compose run --rm backend npm run db:migrate
docker compose up -d --build

Write-Host ""
Write-Host "StackIQ clean-started successfully:"
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:4000"
Write-Host "Health:   http://localhost:4000/health"
