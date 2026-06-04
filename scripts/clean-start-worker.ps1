Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

docker compose rm -sfv worker
docker compose up -d db redis
docker compose up -d --build worker

Write-Host ""
Write-Host "Worker clean-started successfully."
