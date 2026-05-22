param(
  [string]$Chrome = "Google"
)

$ErrorActionPreference = "Stop"
$WindowsDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$vendors = @()
if ($Chrome -eq "All") {
  $vendors = @("Google\Chrome", "Microsoft\Edge")
} elseif ($Chrome -match "Edge") {
  $vendors = @("Microsoft\Edge")
} else {
  $vendors = @("Google\Chrome")
}

$removed = 0
foreach ($vendor in $vendors) {
  $keyPath = "HKCU:\Software\$vendor\NativeMessagingHosts\com.tabctrl.bridge"
  if (Test-Path $keyPath) {
    Remove-Item -Force -Recurse -Path $keyPath
    Write-Host "Removed registry: $keyPath"
    $removed++
  }
}

$manifest = Join-Path $WindowsDir "com.tabctrl.bridge.installed.json"
if (Test-Path $manifest) {
  Remove-Item -Force -Path $manifest
  Write-Host "Removed manifest: $manifest"
  $removed++
}

if ($removed -eq 0) {
  Write-Host "Nothing to uninstall."
}
