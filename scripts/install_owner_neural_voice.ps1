# Owner-approved, free local Kokoro-ONNX CPU voice setup on Windows.
# Official upstream model-files-v1.1 assets, pinned file SHA256, no receipt upload.
# Writes ONLY to gitignored .video-venv and output/voice-models.
# Does not change Windows PATH, system packages, registry or source WebM.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $root '.video-venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'LOCAL_VIDEO_PYTHON_REQUIRED__RUN_EXISTING_VIDEO_SETUP_FIRST'
}
$changes = @(& git -C $root status --porcelain=v1 --untracked-files=normal)
if ($LASTEXITCODE -ne 0 -or $changes.Count -gt 0) {
    throw 'CLEAN_GIT_SOURCE_REQUIRED'
}
$version = (& $python -c "import sys; print(sys.version_info.major, sys.version_info.minor, sep=chr(46))").Trim()
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^3\.(10|11|12|13)$') {
    throw 'PYTHON_VERSION_UNSUPPORTED_BY_LOCAL_KOKORO'
}
$curl = Get-Command 'curl.exe' -ErrorAction SilentlyContinue
if ($null -eq $curl) { throw 'CURL_EXE_REQUIRED_FOR_TLS_DOWNLOAD' }

$assets = Join-Path $root 'output\voice-models'
$null = New-Item -ItemType Directory -Path $assets -Force
$base = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/'
$wanted = @(
    @{
        Filename = 'kokoro-v1.0.fp16.onnx'
        Sha256 = 'f3a290d384fbb27966d462905c71a46cef9e5fd00516b40df32a0b4afe77ac96'
        MinBytes = 150000000
        MaxBytes = 195000000
    },
    @{
        Filename = 'voices-v1.0.bin'
        Sha256 = 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'
        MinBytes = 25000000
        MaxBytes = 35000000
    }
)

foreach ($item in $wanted) {
    $final = Join-Path $assets $item.Filename
    if (Test-Path -LiteralPath $final) {
        $existing = Get-Item -LiteralPath $final
        $digest = (Get-FileHash -LiteralPath $final -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($digest -ne $item.Sha256 -or $existing.Length -lt $item.MinBytes -or
            $existing.Length -gt $item.MaxBytes) {
            throw ('EXISTING_LOCAL_KOKORO_ASSET_INTEGRITY_FAILED__NO_OVERWRITE ' + $item.Filename)
        }
        Write-Output ('LOCAL_ASSET_ALREADY_VERIFIED ' + $item.Filename)
        continue
    }
    $url = $base + $item.Filename
    $temp = Join-Path $assets ($item.Filename + '.' + [Guid]::NewGuid().ToString('N') + '.download')
    try {
        Write-Output ('DOWNLOADING_PUBLIC_OFFICIAL_KOKORO_ASSET ' + $item.Filename)
        & $curl.Source --proto '=https' --tlsv1.2 --location --fail --retry 2 --connect-timeout 30 --max-time 900 --progress-bar --output $temp $url
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temp -PathType Leaf)) {
            throw ('OFFICIAL_KOKORO_DOWNLOAD_FAILED ' + $item.Filename)
        }
        $length = (Get-Item -LiteralPath $temp).Length
        $digest = (Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($length -lt $item.MinBytes -or $length -gt $item.MaxBytes -or
            $digest -ne $item.Sha256) {
            throw ('OFFICIAL_KOKORO_SHA256_OR_SIZE_MISMATCH ' + $item.Filename)
        }
        if (Test-Path -LiteralPath $final) { throw 'MODEL_DESTINATION_BECAME_OCCUPIED' }
        [System.IO.File]::Move($temp, $final)
        Write-Output ('LOCAL_KOKORO_ASSET_SHA256_PASS ' + $item.Filename)
    } finally {
        if (Test-Path -LiteralPath $temp) {
            Remove-Item -LiteralPath $temp -Force
        }
    }
}
# Only the existing ignored Python environment; no global/site changes.
Write-Output 'INSTALLING_FREE_PINNED_OFFLINE_NEURAL_RUNTIME'
& $python -m pip install --disable-pip-version-check --only-binary=:all: 'kokoro-onnx==0.6.1' 'soundfile==0.13.1'
if ($LASTEXITCODE -ne 0) { throw 'LOCAL_NEURAL_RUNTIME_INSTALL_FAILED' }
& $python -m pip show kokoro-onnx soundfile
if ($LASTEXITCODE -ne 0) { throw 'LOCAL_NEURAL_PACKAGE_METADATA_FAILED' }
& $python -c 'import kokoro_onnx, soundfile; print(12345)'
if ($LASTEXITCODE -ne 0) { throw 'LOCAL_NEURAL_IMPORT_FAILED' }
Write-Output 'LOCAL_KOKORO_MODEL_AND_RUNTIME_READY__NO_USER_VIDEO_SENT'
