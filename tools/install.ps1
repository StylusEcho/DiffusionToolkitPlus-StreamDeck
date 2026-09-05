<#
.SYNOPSIS
    Installs or updates the plugin, and tells you what actually ended up on disk.

.DESCRIPTION
    Copying the plugin folder by hand is easy to get half right: pulling in the clone does nothing
    to a copy that was made earlier, and the symptoms of a stale install are silent - a settings
    panel that will not draw, or keys that error with no log to explain why.

    This replaces the installed folder outright and then reports the version and the files that
    matter, so "did the update land" is answerable rather than assumed.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\install.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Restart
#>

[CmdletBinding()]
param(
    # Close and reopen Stream Deck afterwards. It only reads the manifest at startup.
    [switch] $Restart
)

$ErrorActionPreference = 'Stop'

$pluginId = 'com.stylusecho.dtplus.sdPlugin'

$source = Join-Path (Split-Path -Parent $PSScriptRoot) $pluginId
$target = Join-Path $env:APPDATA "Elgato\StreamDeck\Plugins\$pluginId"

if (-not (Test-Path $source)) {
    throw "Cannot find $source. Run this from the repository, not from the installed copy."
}

if (-not (Test-Path (Join-Path $source 'bin\plugin.js'))) {
    throw "bin\plugin.js is missing from $source. Run 'npm install' then 'npm run build' first."
}

# Stream Deck holds the plugin's files open while it is running
$streamDeck = Get-Process -Name 'StreamDeck' -ErrorAction SilentlyContinue

if ($streamDeck) {
    Write-Host 'Closing Stream Deck...'
    $streamDeck | Stop-Process
    Start-Sleep -Seconds 2
}

if (Test-Path $target) {
    Write-Host "Removing the installed copy at $target"
    Remove-Item -Path $target -Recurse -Force
}

Write-Host "Copying $pluginId"
Copy-Item -Path $source -Destination $target -Recurse -Force

# Say what landed, so a stale install is visible rather than inferred from odd behaviour
$manifest = Get-Content (Join-Path $target 'manifest.json') -Raw | ConvertFrom-Json

Write-Host ''
Write-Host "Installed version $($manifest.Version) to:"
Write-Host "  $target"
Write-Host ''

foreach ($file in @('bin\plugin.js', 'manifest.json', 'ui\pi.js', 'ui\pi.css', 'ui\rate.html', 'ui\command.html', 'ui\toggle.html', 'ui\status.html')) {
    $path = Join-Path $target $file
    $mark = if (Test-Path $path) { 'ok     ' } else { 'MISSING' }
    Write-Host "  $mark $file"
}

Write-Host ''

if ($Restart) {
    $exe = Join-Path ${env:ProgramFiles} 'Elgato\StreamDeck\StreamDeck.exe'

    if (Test-Path $exe) {
        Write-Host 'Starting Stream Deck...'
        Start-Process $exe
    }
    else {
        Write-Warning "Could not find Stream Deck at $exe - start it yourself."
    }
}
else {
    Write-Host 'Start Stream Deck again to pick this up.'
}
