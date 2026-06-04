Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$projectName = if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { Split-Path -Leaf $root }
$postgresVolume = "${projectName}_pgdata"

docker compose stop backend worker db
docker compose rm -sfv db
docker volume inspect $postgresVolume *> $null
if ($LASTEXITCODE -eq 0) {
    docker volume rm $postgresVolume
}
docker compose up -d db redis
docker compose run --rm backend npm run db:migrate
docker compose up -d backend worker

Write-Host ""
Write-Host "Database clean-started successfully and migrations were applied."
