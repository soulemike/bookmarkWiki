param(
  [ValidateSet("Chrome", "Edge", "Both")]
  [string]$Browser = "Chrome",
  [string]$ExtensionId,
  [switch]$Machine
)

$ErrorActionPreference = "Stop"

if (-not $ExtensionId) {
  throw "Pass -ExtensionId with the unpacked or store extension ID. allowed_origins cannot use wildcards."
}

$hostName = "com.bookmark_queue_agent.host"
$hostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceManifest = Join-Path $hostRoot "manifests\chrome-windows.json"
$installedManifest = Join-Path $hostRoot "manifests\chrome-windows.installed.json"
$hostLauncher = Join-Path $hostRoot "bookmark-queue-agent-host.cmd"

$manifest = Get-Content $sourceManifest -Raw | ConvertFrom-Json
$manifest.path = $hostLauncher
$manifest.allowed_origins = @("chrome-extension://$ExtensionId/")
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $installedManifest -Encoding UTF8

$root = if ($Machine) { "Registry::HKEY_LOCAL_MACHINE" } else { "Registry::HKEY_CURRENT_USER" }
$browserKeys = @()
if ($Browser -eq "Chrome" -or $Browser -eq "Both") { $browserKeys += "Software\Google\Chrome\NativeMessagingHosts\$hostName" }
if ($Browser -eq "Edge" -or $Browser -eq "Both") { $browserKeys += "Software\Microsoft\Edge\NativeMessagingHosts\$hostName" }

foreach ($key in $browserKeys) {
  $registryPath = Join-Path $root $key
  New-Item -Path $registryPath -Force | Out-Null
  Set-Item -Path $registryPath -Value $installedManifest
  Write-Host "Registered $hostName at $registryPath -> $installedManifest"
}

Write-Host "Native host installation complete. Use the extension options page 'Test native host' button to verify."
