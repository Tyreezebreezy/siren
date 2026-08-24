[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot

Push-Location $repository
try {
    & npm.cmd run check
    if ($LASTEXITCODE -ne 0) { throw 'Frontend validation failed.' }

    & cargo fmt --manifest-path 'src-tauri\Cargo.toml' -- --check
    if ($LASTEXITCODE -ne 0) { throw 'Rust formatting check failed.' }

    & cargo check --locked --manifest-path 'src-tauri\Cargo.toml'
    if ($LASTEXITCODE -ne 0) { throw 'Rust build check failed.' }
}
finally {
    Pop-Location
}

Write-Host 'SIREN_VALIDATION=PASS'
