param([Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'install-local-bridge.ps1') -ExtensionId $ExtensionId
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Bridge installation failed' }
$agentCliPath=Join-Path $env:LOCALAPPDATA 'HoverPrompt\cli\imageprompt.mjs'
& node $agentCliPath local doctor
if ($LASTEXITCODE -ne 0) { throw 'CLI diagnostic failed' }
& node $agentCliPath help
if ($LASTEXITCODE -ne 0) { throw 'CLI help failed' }
Write-Output 'Setup complete. Enable local cache + CLI control in extension Local CLI settings; refresh cache. Use local scan to verify live connectivity. No analysis requests were submitted.'
