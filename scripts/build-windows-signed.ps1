[CmdletBinding()]
param(
    [string] $Thumbprint = $env:WINDOWS_CERT_THUMBPRINT,
    [string] $TimestampUrl = $env:WINDOWS_TIMESTAMP_URL
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TimestampUrl)) {
    $TimestampUrl = "http://timestamp.digicert.com"
}

if ([string]::IsNullOrWhiteSpace($Thumbprint)) {
    throw @"
No code-signing certificate thumbprint was provided.

Install the certificate under Cert:\CurrentUser\My, then set:
  `$env:WINDOWS_CERT_THUMBPRINT = "YOUR_CERTIFICATE_THUMBPRINT"

Find the thumbprint with:
  Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select-Object Subject,Thumbprint,NotAfter
"@
}

$normalizedThumbprint = ($Thumbprint -replace '\s', '').ToUpperInvariant()
$certificate = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object { $_.Thumbprint -eq $normalizedThumbprint } |
    Select-Object -First 1

if (-not $certificate) {
    throw "No code-signing certificate with thumbprint $normalizedThumbprint was found in CurrentUser\My."
}
if (-not $certificate.HasPrivateKey) {
    throw "The certificate $normalizedThumbprint has no private key available to this user."
}
if ($certificate.NotAfter -lt (Get-Date)) {
    throw "The certificate $normalizedThumbprint expired on $($certificate.NotAfter)."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "crates\craft-studio-shell"
$configPath = Join-Path $repoRoot "target\signing\tauri.windows.conf.json"

Write-Host "Signing with: $($certificate.Subject)"
Write-Host "Thumbprint:   $normalizedThumbprint"
Write-Host "Expires:      $($certificate.NotAfter)"

# Tauri merges this overlay with tauri.conf.json, so the thumbprint never needs
# to be committed to the repository.
$overlay = @{
    bundle = @{
        windows = @{
            certificateThumbprint = $normalizedThumbprint
            digestAlgorithm       = "sha256"
            timestampUrl          = $TimestampUrl
        }
    }
} | ConvertTo-Json -Depth 5

New-Item -ItemType Directory -Path (Split-Path -Parent $configPath) -Force | Out-Null
# Write UTF-8 without a BOM; serde_json does not accept a BOM before the opening brace.
[System.IO.File]::WriteAllText($configPath, $overlay, (New-Object System.Text.UTF8Encoding($false)))

try {
    Push-Location $appDir
    try {
        & npx --yes "@tauri-apps/cli@^2" build --config $configPath
        if ($LASTEXITCODE -ne 0) {
            throw "tauri build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item $configPath -Force -ErrorAction SilentlyContinue
}

$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
    $kitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
    $signtool = Get-ChildItem $kitsRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
        Sort-Object FullName -Descending |
        Select-Object -First 1
}

if (-not $signtool) {
    throw "signtool.exe was not found. Install the Windows SDK, then run this script again."
}

$signtoolPath = if ($signtool -is [System.Management.Automation.ApplicationInfo]) { $signtool.Source } else { $signtool.FullName }

$artifacts = @(
    (Join-Path $repoRoot "target\release\craft-studio-shell.exe"),
    (Join-Path $repoRoot "target\release\bundle\nsis\ArtCraft Studio_0.1.0_x64-setup.exe"),
    (Join-Path $repoRoot "target\release\bundle\msi\ArtCraft Studio_0.1.0_x64_en-US.msi")
)

foreach ($artifact in $artifacts) {
    if (-not (Test-Path $artifact)) {
        throw "Expected signed artifact was not produced: $artifact"
    }

    # Tauri signs the executables it feeds into each bundle, but building two
    # bundle types can leave the standalone release executable unsigned.
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact
    if ($signature.Status -eq [System.Management.Automation.SignatureStatus]::NotSigned) {
        Write-Host "Signing $artifact"
        & $signtoolPath sign /sha1 $normalizedThumbprint /fd sha256 /tr $TimestampUrl /td sha256 $artifact
        if ($LASTEXITCODE -ne 0) {
            throw "Signing failed for $artifact."
        }
    }
}

foreach ($artifact in $artifacts) {
    Write-Host "Verifying $artifact"
    & $signtoolPath verify /pa /all $artifact
    if ($LASTEXITCODE -ne 0) {
        throw "Signature verification failed for $artifact."
    }
}

Write-Host ""
Write-Host "Signed and verified:"
$artifacts | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "SmartScreen reputation is separate from signing. A new certificate can still show a warning until Microsoft accumulates reputation for it; signing every release with the same certificate is what builds that reputation."
