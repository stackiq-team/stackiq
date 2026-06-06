param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not $Force) {
    Write-Host "This will delete ALL Docker containers and ALL Docker images on this machine."
    Write-Host "Docker volumes will not be deleted."
    $confirmation = Read-Host "Type DELETE to continue"

    if ($confirmation -ne "DELETE") {
        Write-Host "Cancelled."
        exit 0
    }
}

$containers = @(docker ps -aq)
if ($containers.Count -gt 0) {
    Write-Host "Removing Docker containers..."
    docker rm -f $containers
} else {
    Write-Host "No Docker containers found."
}

$images = @(docker images -aq | Select-Object -Unique)
if ($images.Count -gt 0) {
    Write-Host "Removing Docker images..."
    docker rmi -f $images
} else {
    Write-Host "No Docker images found."
}

Write-Host ""
Write-Host "Docker containers and images cleaned."
