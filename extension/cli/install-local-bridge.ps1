param([Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId)
$ErrorActionPreference='Stop'
# Tool folder: %LOCALAPPDATA%\HoverPrompt. An install from before the rename (%LOCALAPPDATA%\ImagePrompt) is moved here:
# the cache and config.json come along (a cacheDir pointing inside the old folder is rewritten), the old bridge and CLI
# are replaced by fresh copies below, and the browsers are pointed at the new bridge. The old folder is left with
# whatever was not moved; it is no longer used and can be deleted.
$toolRoot=Join-Path $env:LOCALAPPDATA 'HoverPrompt'
$oldRoot=Join-Path $env:LOCALAPPDATA 'ImagePrompt'
New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
if (Test-Path -LiteralPath $oldRoot) {
    $oldCache=Join-Path $oldRoot 'cache';$newCache=Join-Path $toolRoot 'cache'
    if ((Test-Path -LiteralPath $oldCache) -and -not (Test-Path -LiteralPath $newCache)) { Move-Item -LiteralPath $oldCache -Destination $newCache; Write-Output "Moved cache: $oldCache -> $newCache" }
    $oldConfig=Join-Path $oldRoot 'config.json';$newConfig=Join-Path $toolRoot 'config.json'
    if ((Test-Path -LiteralPath $oldConfig) -and -not (Test-Path -LiteralPath $newConfig)) {
        $text=[IO.File]::ReadAllText($oldConfig)
        try { $json=$text | ConvertFrom-Json; if ($json.cacheDir -and ([string]$json.cacheDir).StartsWith($oldRoot,[StringComparison]::OrdinalIgnoreCase)) { $json.cacheDir=$toolRoot+([string]$json.cacheDir).Substring($oldRoot.Length); $text=$json | ConvertTo-Json } } catch {}
        [IO.File]::WriteAllText($newConfig,$text,(New-Object Text.UTF8Encoding $false)); Remove-Item -LiteralPath $oldConfig; Write-Output "Moved settings: $newConfig"
    }
    # other kept folders (deploy-tool credentials, cache backups) move too; the old bridge, CLI and public copies are replaced
    foreach ($item in Get-ChildItem -LiteralPath $oldRoot -Directory | Where-Object { $_.Name -notin 'bridge','cli','public','cache' }) { $target=Join-Path $toolRoot $item.Name; if (-not (Test-Path -LiteralPath $target)) { Move-Item -LiteralPath $item.FullName -Destination $target; Write-Output "Moved: $($item.Name)" } }
}
$bridgeRoot=Join-Path $toolRoot 'bridge'
New-Item -ItemType Directory -Path $bridgeRoot -Force | Out-Null
$nodePath=(Get-Command node.exe).Source
$cliRoot=Join-Path $toolRoot 'cli'
$publicRoot=Join-Path $toolRoot 'public'
New-Item -ItemType Directory -Path $cliRoot,$publicRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'imageprompt.mjs') -Destination (Join-Path $cliRoot 'imageprompt.mjs') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'cache-files.mjs') -Destination (Join-Path $cliRoot 'cache-files.mjs') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'cache-files.mjs') -Destination (Join-Path $bridgeRoot 'cache-files.mjs') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\public\zip.js') -Destination (Join-Path $publicRoot 'zip.js') -Force
[IO.File]::WriteAllText((Join-Path $toolRoot 'package.json'),'{"type":"module"}',(New-Object Text.UTF8Encoding $false))
$hostScript=Join-Path $bridgeRoot 'native-host.mjs'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'native-host.mjs') -Destination $hostScript -Force
$launcher=Join-Path $bridgeRoot 'host.cmd'
[IO.File]::WriteAllText($launcher,('@echo off'+"`r`n"+'"'+$nodePath+'" "'+$hostScript+'"'+"`r`n"),[Text.Encoding]::ASCII)
$manifestPath=Join-Path $bridgeRoot 'com.imageprompt.local.json'
$manifestText=@{name='com.imageprompt.local';description='HoverPrompt local image and prompt cache';path=$launcher;type='stdio';allowed_origins=@("chrome-extension://$ExtensionId/")} | ConvertTo-Json
[IO.File]::WriteAllText($manifestPath,$manifestText,(New-Object Text.UTF8Encoding $false))
foreach($browserKey in @('HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.imageprompt.local','HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.imageprompt.local')){New-Item -Path $browserKey -Force | Out-Null;Set-Item -Path $browserKey -Value $manifestPath}
Write-Output "Installed HoverPrompt local bridge. Enable local cache in extension settings. Cache: $toolRoot\cache"

Write-Output "Agent CLI: $cliRoot\imageprompt.mjs"
