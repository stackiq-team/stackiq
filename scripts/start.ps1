Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Get-EnvFileValue {
    param(
        [string]$Name,
        [string]$DefaultValue
    )

    $envFile = Join-Path $root ".env"
    if (-not (Test-Path $envFile)) {
        return $DefaultValue
    }

    $line = Get-Content $envFile |
        Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
        Select-Object -First 1

    if (-not $line) {
        return $DefaultValue
    }

    $value = ($line -replace "^\s*$([regex]::Escape($Name))\s*=", "").Split("#")[0].Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value
}

$workerReplicas = Get-EnvFileValue -Name "WORKER_REPLICAS" -DefaultValue "5"

docker compose up -d --build --scale "worker=$workerReplicas"

Write-Host ""
Write-Host "StackIQ is starting:"
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:4000"
Write-Host "Health:   http://localhost:4000/health"
Write-Host "Queue:    http://localhost:4000/queue/status"
Write-Host "Workers:  $workerReplicas worker containers, WORKER_CONCURRENCY controls jobs per container"
