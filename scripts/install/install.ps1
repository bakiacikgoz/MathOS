$ErrorActionPreference = 'Stop'

$baseUrl = $env:MATHOS_RELEASE_BASE_URL
$version = $env:MATHOS_VERSION
if ([string]::IsNullOrWhiteSpace($baseUrl) -or [string]::IsNullOrWhiteSpace($version)) {
  throw 'Set MATHOS_RELEASE_BASE_URL and MATHOS_VERSION to an exact official release.'
}
$architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$archiveName = "mathos-$version-windows-$architecture.tar.gz"
$installationRoot = if ($env:MATHOS_INSTALL_ROOT) { $env:MATHOS_INSTALL_ROOT } else { Join-Path $env:LOCALAPPDATA 'Programs\MathOS' }
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("mathos-install-" + [guid]::NewGuid().ToString('N'))
$tarExecutable = if ($env:SystemRoot) { Join-Path $env:SystemRoot 'System32\tar.exe' } else { '' }
if ([string]::IsNullOrWhiteSpace($tarExecutable) -or !(Test-Path -LiteralPath $tarExecutable -PathType Leaf)) {
  throw "Windows built-in tar.exe is unavailable: $tarExecutable"
}

function Copy-ReleaseAsset([string]$name, [string]$destination) {
  $uri = [uri]("$($baseUrl.TrimEnd('/'))/$name")
  if ($uri.Scheme -eq 'file') {
    Copy-Item -LiteralPath $uri.LocalPath -Destination $destination
  } else {
    if ($uri.Scheme -ne 'https') { throw "Unsupported release URL scheme: $($uri.Scheme)" }
    Invoke-WebRequest -Uri $uri.AbsoluteUri -OutFile $destination -UseBasicParsing
  }
}

New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null
try {
  $archivePath = Join-Path $temporaryRoot 'release.tar.gz'
  $checksumPath = Join-Path $temporaryRoot 'SHA256SUMS'
  Copy-ReleaseAsset $archiveName $archivePath
  Copy-ReleaseAsset 'SHA256SUMS' $checksumPath
  $pattern = '^([0-9a-fA-F]{64})  ' + [regex]::Escape($archiveName) + '$'
  $matches = @(Get-Content -LiteralPath $checksumPath | Where-Object { $_ -match $pattern })
  if ($matches.Count -ne 1) { throw "Checksum entry missing or duplicated: $archiveName" }
  $expected = ([regex]::Match($matches[0], $pattern)).Groups[1].Value
  $stream = [IO.File]::OpenRead($archivePath)
  try {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $actual = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
    finally { $hasher.Dispose() }
  } finally { $stream.Dispose() }
  if ($actual -ine $expected) { throw "Checksum mismatch: $archiveName" }

  Push-Location -LiteralPath $temporaryRoot
  try {
    $entries = @(& $tarExecutable -tzf 'release.tar.gz')
    if ($LASTEXITCODE -ne 0) { throw "Archive listing failed: $archiveName" }
    foreach ($entry in $entries) {
      if ($entry -notmatch '^root(?:/|$)' -or $entry -match '(^|/)\.{1,2}(/|$)' -or $entry.Contains('\')) {
        throw "Unsafe archive path: $entry"
      }
    }
    $details = @(& $tarExecutable -tvzf 'release.tar.gz')
    if ($LASTEXITCODE -ne 0) { throw "Archive listing failed: $archiveName" }
    foreach ($line in $details) {
      if ($line.Length -eq 0 -or ($line[0] -ne '-' -and $line[0] -ne 'd')) { throw 'Unsafe archive entry type.' }
    }
    & $tarExecutable -xzf 'release.tar.gz' -C .
    if ($LASTEXITCODE -ne 0) { throw "Archive extraction failed: $archiveName" }
  } finally {
    Pop-Location
  }
  $sourceRoot = Join-Path $temporaryRoot 'root'
  $sourceBinary = Join-Path $sourceRoot 'bin\mathos.exe'
  $sourceShare = Join-Path $sourceRoot 'share\mathos'
  if (!(Test-Path -LiteralPath $sourceBinary -PathType Leaf) -or !(Test-Path -LiteralPath $sourceShare -PathType Container)) {
    throw 'Release layout incomplete.'
  }
  & $sourceBinary --version --json | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Packaged MathOS smoke test failed.' }

  $binRoot = Join-Path $installationRoot 'bin'
  $shareRoot = Join-Path $installationRoot 'share'
  New-Item -ItemType Directory -Path $binRoot, $shareRoot -Force | Out-Null
  $binary = Join-Path $binRoot 'mathos.exe'
  $assets = Join-Path $shareRoot 'mathos'
  $stageBinary = Join-Path $binRoot ('mathos.new.' + [guid]::NewGuid().ToString('N') + '.exe')
  $stageAssets = Join-Path $shareRoot ('mathos.new.' + [guid]::NewGuid().ToString('N'))
  $backupBinary = Join-Path $binRoot ('mathos.old.' + [guid]::NewGuid().ToString('N') + '.exe')
  $backupAssets = Join-Path $shareRoot ('mathos.old.' + [guid]::NewGuid().ToString('N'))
  $binaryBackedUp = $false; $assetsBackedUp = $false
  $binaryInstalled = $false; $assetsInstalled = $false
  try {
    Copy-Item -LiteralPath $sourceBinary -Destination $stageBinary
    Copy-Item -LiteralPath $sourceShare -Destination $stageAssets -Recurse
    foreach ($name in @('LICENSE', 'NOTICE', 'SOURCE.json', 'SBOM.json', 'THIRD_PARTY_LICENSES.json', 'THIRD_PARTY_NOTICES.txt')) {
      Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $stageAssets $name)
    }
    if (Test-Path -LiteralPath $assets) { Move-Item -LiteralPath $assets -Destination $backupAssets; $assetsBackedUp = $true }
    Move-Item -LiteralPath $stageAssets -Destination $assets; $assetsInstalled = $true
    if (Test-Path -LiteralPath $binary) { Move-Item -LiteralPath $binary -Destination $backupBinary; $binaryBackedUp = $true }
    Move-Item -LiteralPath $stageBinary -Destination $binary; $binaryInstalled = $true
    & $binary --version --json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Installed MathOS smoke test failed.' }
  } catch {
    $failure = $_.Exception.Message
    $recoveryErrors = @()
    if ($binaryInstalled) {
      try { Remove-Item -LiteralPath $binary -Force }
      catch { $recoveryErrors += "new binary could not be removed: $($_.Exception.Message)" }
    }
    if ($binaryBackedUp) {
      if (!(Test-Path -LiteralPath $binary)) {
        try { Move-Item -LiteralPath $backupBinary -Destination $binary }
        catch { $recoveryErrors += "old binary could not be restored from $backupBinary : $($_.Exception.Message)" }
      } else { $recoveryErrors += "old binary retained at $backupBinary because $binary is occupied" }
    }
    if ($assetsInstalled) {
      try { Remove-Item -LiteralPath $assets -Recurse -Force }
      catch { $recoveryErrors += "new assets could not be removed: $($_.Exception.Message)" }
    }
    if ($assetsBackedUp) {
      if (!(Test-Path -LiteralPath $assets)) {
        try { Move-Item -LiteralPath $backupAssets -Destination $assets }
        catch { $recoveryErrors += "old assets could not be restored from $backupAssets : $($_.Exception.Message)" }
      } else { $recoveryErrors += "old assets retained at $backupAssets because $assets is occupied" }
    }
    $recovery = if ($recoveryErrors.Count) { $recoveryErrors -join '; ' } else { 'old installation restored or untouched' }
    throw "MathOS installation failed: $failure. Recovery: $recovery"
  } finally {
    if (Test-Path -LiteralPath $stageBinary) { try { Remove-Item -LiteralPath $stageBinary -Force } catch { Write-Warning "Staged binary remains at $stageBinary" } }
    if (Test-Path -LiteralPath $stageAssets) { try { Remove-Item -LiteralPath $stageAssets -Recurse -Force } catch { Write-Warning "Staged assets remain at $stageAssets" } }
  }
  if ($binaryBackedUp) { try { Remove-Item -LiteralPath $backupBinary -Force } catch { Write-Warning "Previous binary remains at $backupBinary" } }
  if ($assetsBackedUp) { try { Remove-Item -LiteralPath $backupAssets -Recurse -Force } catch { Write-Warning "Previous assets remain at $backupAssets" } }
  Write-Output "Installed MathOS $version to $binary"
} finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
}
