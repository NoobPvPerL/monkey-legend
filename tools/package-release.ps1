[CmdletBinding()]
param(
    [string]$OutputDirectory = 'releases/final',
    [string]$NodeVersion = '24.19.0',
    [switch]$SkipBuild,
    [switch]$AllowDirty
)
$ErrorActionPreference = 'Stop'
$p1Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $p1Root
$p1Package = Get-Content -LiteralPath (Join-Path $p1Root 'package.json') -Raw | ConvertFrom-Json
$p1Version = $p1Package.version
if ($p1Version -notmatch '^\d+\.\d+\.\d+-p1\.\d+$' -or $NodeVersion -notmatch '^24\.\d+\.\d+$') { throw 'Invalid P1 or Node version' }
$p1Commit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify source commit' }
$p1Dirty = @(& git status --porcelain).Count -gt 0
if ($p1Dirty -and -not $AllowDirty) { throw 'Commit source changes first. Use -AllowDirty only for a disposable candidate.' }
if (-not $SkipBuild) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Build failed' } }
if (-not (Test-Path -LiteralPath (Join-Path $p1Root 'dist/index.html'))) { throw 'Missing built game' }

$p1Cache = Join-Path $p1Root '.release-cache'
New-Item -ItemType Directory -Path $p1Cache -Force | Out-Null
$p1ArchiveName = "node-v$NodeVersion-win-x64.zip"
$p1BaseUrl = "https://nodejs.org/dist/v$NodeVersion"
$p1Sums = (Invoke-WebRequest -Uri "$p1BaseUrl/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 60).Content
$p1ZipLine = @($p1Sums -split "`n" | Where-Object { $_.Trim().EndsWith("  $p1ArchiveName") })
$p1ExeLine = @($p1Sums -split "`n" | Where-Object { $_.Trim().EndsWith('  win-x64/node.exe') })
if ($p1ZipLine.Count -ne 1 -or $p1ExeLine.Count -ne 1) { throw 'Official Node checksums unavailable' }
$p1ZipHash = ($p1ZipLine[0] -split '\s+')[0].ToLowerInvariant()
$p1ExeHash = ($p1ExeLine[0] -split '\s+')[0].ToLowerInvariant()
$p1NodeZip = Join-Path $p1Cache $p1ArchiveName
if (-not (Test-Path -LiteralPath $p1NodeZip)) {
    Write-Host "Downloading official Node.js $NodeVersion Windows x64 runtime..."
    Invoke-WebRequest -Uri "$p1BaseUrl/$p1ArchiveName" -OutFile $p1NodeZip -UseBasicParsing -TimeoutSec 300
}
if ((Get-FileHash -LiteralPath $p1NodeZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p1ZipHash) { throw 'Node archive SHA-256 mismatch' }
$p1NodeDir = Join-Path $p1Cache "node-v$NodeVersion-win-x64"
if (-not (Test-Path -LiteralPath (Join-Path $p1NodeDir 'node.exe'))) { Expand-Archive -LiteralPath $p1NodeZip -DestinationPath $p1Cache }
if ((Get-FileHash -LiteralPath (Join-Path $p1NodeDir 'node.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p1ExeHash) { throw 'Node executable SHA-256 mismatch' }

$p1Output = [IO.Path]::GetFullPath((Join-Path $p1Root $OutputDirectory))
if (-not $p1Output.StartsWith($p1Root + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Output must stay in this repository' }
New-Item -ItemType Directory -Path $p1Output -Force | Out-Null
$p1Name = "monkey-legend-$p1Version-windows-x64"
$p1Stage = Join-Path $p1Output $p1Name
$p1Zip = Join-Path $p1Output "$p1Name.zip"
if ((Test-Path -LiteralPath $p1Stage) -or (Test-Path -LiteralPath $p1Zip)) { throw 'Output already exists; choose a new output directory' }
New-Item -ItemType Directory -Path $p1Stage | Out-Null
Copy-Item -LiteralPath (Join-Path $p1Root 'dist') -Destination $p1Stage -Recurse
New-Item -ItemType Directory -Path (Join-Path $p1Stage 'runtime'),(Join-Path $p1Stage 'tools'),(Join-Path $p1Stage 'licenses') | Out-Null
Copy-Item -LiteralPath (Join-Path $p1NodeDir 'node.exe') -Destination (Join-Path $p1Stage 'runtime/node.exe')
$p1License = Join-Path $p1NodeDir 'LICENSE'
if (-not (Test-Path -LiteralPath $p1License)) { $p1License = Join-Path $p1NodeDir 'LICENSE.txt' }
Copy-Item -LiteralPath $p1License -Destination (Join-Path $p1Stage 'runtime/LICENSE.txt')
foreach ($p1Dependency in @('react','react-dom','scheduler')) {
    Copy-Item -LiteralPath (Join-Path $p1Root "node_modules/$p1Dependency/LICENSE") -Destination (Join-Path $p1Stage "licenses/$p1Dependency-LICENSE.txt")
}
foreach ($p1Script in @('local-server.mjs','start-local.mjs')) { Copy-Item -LiteralPath (Join-Path $p1Root "tools/$p1Script") -Destination (Join-Path $p1Stage "tools/$p1Script") }
$p1Launcher = [IO.File]::ReadAllText((Join-Path $p1Root 'start-local.cmd')) -replace '\r?\n',"`r`n"
[IO.File]::WriteAllText((Join-Path $p1Stage '启动游戏.cmd'),$p1Launcher,[Text.UTF8Encoding]::new($false))
$p1Files = @{}
Get-ChildItem -LiteralPath $p1Stage -Recurse -File | ForEach-Object {
    $p1Relative = $_.FullName.Substring($p1Stage.Length + 1).Replace('\','/')
    $p1Files[$p1Relative] = @{sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$_.Length}
}
$p1Manifest = [ordered]@{version=$p1Version;ruleVersion='web-v0.1.1';sourceCommit=$p1Commit;sourceDirty=$p1Dirty;platform='windows-x64';nodeVersion=$NodeVersion;nodeArchiveUrl="$p1BaseUrl/$p1ArchiveName";nodeArchiveSha256=$p1ZipHash;files=$p1Files}
[IO.File]::WriteAllText((Join-Path $p1Stage 'release-manifest.json'),($p1Manifest | ConvertTo-Json -Depth 6) + "`n",[Text.UTF8Encoding]::new($false))
Compress-Archive -LiteralPath $p1Stage -DestinationPath $p1Zip -CompressionLevel Optimal
$p1Hash = (Get-FileHash -LiteralPath $p1Zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $p1Output 'SHA256SUMS.txt'),"$p1Hash  $p1Name.zip`n",[Text.UTF8Encoding]::new($false))
Write-Host "PASS: packaged $p1Zip"
Write-Host "SHA-256: $p1Hash"
