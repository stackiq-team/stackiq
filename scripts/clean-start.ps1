Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "Cleaning StackIQ Docker containers, volumes, and local images..."
docker compose down --volumes --rmi local --remove-orphans

Write-Host "Building and starting database services..."
docker compose up -d --build --wait db redis

Write-Host "Applying Prisma migrations..."
docker compose run --rm backend npm run db:migrate

Write-Host "Verifying database schema..."
docker compose run --rm backend npx prisma migrate status
docker compose run --rm backend npx ts-node src/db/prisma.validation.ts

Write-Host "Building and starting the app..."
docker compose up -d --build --wait

Write-Host ""
Write-Host "StackIQ clean-started successfully:"
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:4000"
Write-Host "Health:   http://localhost:4000/health"
