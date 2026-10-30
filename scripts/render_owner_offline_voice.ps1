# Owner-only free OFFLINE English narration using installed Windows SAPI voice.
# No external text API, no uploaded private receipt, no payments, no original overwrite.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$folder = Join-Path $root 'output\videos'
if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
    throw 'PRIVATE_VIDEO_FOLDER_NOT_FOUND'
}
$head = (& git -C $root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[a-f0-9]{40}$') { throw 'SOURCE_SHA_NOT_AVAILABLE' }
$workingChanges = @(& git -C $root status --porcelain=v1 --untracked-files=normal)
if ($LASTEXITCODE -ne 0 -or $workingChanges.Count -gt 0) { throw 'CLEAN_GIT_SOURCE_REQUIRED' }

$selected = $null
$manifest = $null
foreach ($file in @(Get-ChildItem -LiteralPath $folder -Filter 'paypal-synthetic-review-*.manifest.json' | Sort-Object LastWriteTime -Descending)) {
    try {
        $candidate = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($candidate.presentation_mode -eq 'GUIDED_REAL_BROWSER_CURSOR_NO_POST_ZOOM' -and
            $candidate.source_commit_sha -eq $head -and
            $candidate.source_tracked_tree_clean -eq $true -and
            $candidate.provider_calls -eq 0 -and $candidate.payment_posts -eq 0 -and
            $candidate.publicly_uploaded -eq $false -and
            $candidate.narration_script_version -eq 'PROOFLINE_PREMIUM_CUES_V1' -and
            @($candidate.narration_cues).Count -ge 10 -and
            @($candidate.narration_cues).Count -le 24) {
            $selected = $file
            $manifest = $candidate
            break
        }
    } catch {
        # Ignore unrelated/old manifests; never modify them.
    }
}
if ($null -eq $selected) { throw 'PREMIUM_VIDEO_WITH_SAFE_NARRATION_CUES_REQUIRED__RE_RECORD_FIRST' }
$sourceVideo = Join-Path $folder $manifest.video_filename
if (-not (Test-Path -LiteralPath $sourceVideo -PathType Leaf)) { throw 'SOURCE_VIDEO_MISSING' }
if ((Get-FileHash -LiteralPath $sourceVideo -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.video_sha256) {
    throw 'SOURCE_VIDEO_HASH_MISMATCH'
}

Add-Type -AssemblyName System.Speech
$voiceEngine = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($voiceEngine.GetInstalledVoices() | Where-Object {
    $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'en'
})
if ($voices.Count -eq 0) {
    $voiceEngine.Dispose()
    throw 'ENGLISH_WINDOWS_SPEECH_VOICE_NOT_INSTALLED__NO_AUDIO_CREATED'
}
# Choose a neutral English voice from installed OFFLINE Windows voices.
$preferred = @($voices | Where-Object { $_.VoiceInfo.Name -match 'Zira|Aria|Jenny|Guy|David' })
$selectedVoice = if ($preferred.Count -gt 0) { $preferred[0] } else { $voices[0] }
$voiceEngine.SelectVoice($selectedVoice.VoiceInfo.Name)
$voiceEngine.Rate = 0
$voiceEngine.Volume = 100

$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6)
$audioDir = Join-Path $folder ('private-voice-' + $stamp)
$null = New-Item -ItemType Directory -Path $audioDir -ErrorAction Stop
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo -ArgumentList @(
    22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
)
$items = @()
try {
    $index = 0
    foreach ($cue in @($manifest.narration_cues)) {
        $index++
        if ($cue.text -isnot [string] -or $cue.text.Length -lt 4 -or $cue.text.Length -gt 250) {
            throw 'UNSAFE_OR_INVALID_VOICE_CUE'
        }
        $name = 'voice_{0:D2}.wav' -f $index
        $path = Join-Path $audioDir $name
        $voiceEngine.SetOutputToWaveFile($path,$format)
        $voiceEngine.Speak([string]$cue.text)
        $voiceEngine.SetOutputToNull()
        $items += @{ file=$name; at_seconds=[double]$cue.at_seconds }
    }
} finally {
    $voiceEngine.Dispose()
}
$timeline = Join-Path $audioDir 'timeline.json'
@{ items=$items } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $timeline -Encoding UTF8
$python = Join-Path $root '.video-venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'LOCAL_PYTHON_VIDEO_ENV_REQUIRED'
}
$mix = Join-Path $audioDir 'narration.wav'
& $python (Join-Path $root 'scripts\mix_private_voice.py') --timeline $timeline --output $mix
if ($LASTEXITCODE -ne 0) { throw 'OFFLINE_NARRATION_MIX_FAILED' }

$ffmpeg = $null
$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ffmpegCommand) { $ffmpeg = $ffmpegCommand.Source }
if (-not $ffmpeg -and $env:LOCALAPPDATA) {
    $pw = Join-Path $env:LOCALAPPDATA 'ms-playwright'
    if (Test-Path -LiteralPath $pw -PathType Container) {
        foreach ($tool in @(Get-ChildItem -LiteralPath $pw -Directory -Filter 'ffmpeg-*' | Sort-Object Name -Descending)) {
            $exe = Join-Path $tool.FullName 'ffmpeg-win64.exe'
            if (Test-Path -LiteralPath $exe -PathType Leaf) { $ffmpeg = $exe; break }
        }
    }
}
if (-not $ffmpeg) { throw 'FFMPEG_NOT_FOUND__VOICE_WAV_RETAINED' }
$encoders = (& $ffmpeg -hide_banner -encoders 2>&1 | Out-String)
$codec = if ($encoders -match 'libopus') { 'libopus' } elseif ($encoders -match ' opus ') { 'opus' } else { $null }
if (-not $codec) {
    # Pinned open-source portable FFmpeg fallback. Package downloads tools only,
    # NEVER sends the script, cue text, video, receipt or private identifiers.
    Write-Output 'Installing free pinned local FFmpeg binary (imageio-ffmpeg==0.6.0)...'
    & $python -m pip install --disable-pip-version-check 'imageio-ffmpeg==0.6.0'
    if ($LASTEXITCODE -ne 0) { throw 'LOCAL_FFMPEG_INSTALL_FAILED__VOICE_WAV_RETAINED' }
    $ffmpegFromPython = (& $python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())' | Out-String).Trim()
    if (-not (Test-Path -LiteralPath $ffmpegFromPython -PathType Leaf)) {
        throw 'LOCAL_FFMPEG_BINARY_UNAVAILABLE__VOICE_WAV_RETAINED'
    }
    $ffmpeg = $ffmpegFromPython
    $encoders = (& $ffmpeg -hide_banner -encoders 2>&1 | Out-String)
    $codec = if ($encoders -match 'libopus') { 'libopus' } elseif ($encoders -match ' opus ') { 'opus' } else { $null }
    if (-not $codec) { throw 'FFMPEG_OPUS_ENCODER_UNAVAILABLE__VOICE_WAV_RETAINED' }
}

$movie = Join-Path $folder ('proofline-premium-narrated-' + $stamp + '.webm')
# 'apad' fills the remaining audio with silence; '-shortest' ends on the video,
# avoiding an audio-only tail or cutting the underlying browser recording.
& $ffmpeg -hide_banner -loglevel error -nostdin -n -i $sourceVideo -i $mix -map '0:v:0' -map '1:a:0' -c:v copy -c:a $codec -b:a 96k -af apad -shortest $movie
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $movie -PathType Leaf) -or
    (Get-Item -LiteralPath $movie).Length -lt 10240) {
    throw 'FFMPEG_NARRATION_MUX_FAILED__VOICE_WAV_RETAINED'
}
$report = [ordered]@{
    status = 'OWNER_LOCAL_NARRATED_DRAFT_NEEDS_EDITORIAL_REVIEW'
    sourceSha = $head
    originalVideo = $manifest.video_filename
    originalSha256 = $manifest.video_sha256
    voicedVideo = (Split-Path -Leaf $movie)
    voicedSha256 = (Get-FileHash -LiteralPath $movie -Algorithm SHA256).Hash.ToLowerInvariant()
    voice = $selectedVoice.VoiceInfo.Name
    cues = $items.Count
    independentMediaDurationVerified = $false
    liveProviderCalls = 0
    paymentPosts = 0
    publiclyUploaded = $false
    ownerApproved = $false
}
$reportPath = Join-Path $audioDir 'narration_report.json'
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Output ('OWNER_NARRATED_PRIVATE_DRAFT ' + $movie)
Write-Output ('WINDOWS_OFFLINE_ENGLISH_VOICE ' + $selectedVoice.VoiceInfo.Name)
Write-Output ('VOICE_CUES ' + $items.Count)
Write-Output 'NO_PROVIDER_REQUESTS NO_PAYMENTS NO_PUBLIC_UPLOAD'
Write-Output 'VOICE_QUALITY_AND_MEDIA_DURATION_STILL_REQUIRE_OWNER_AND_INDEPENDENT_REVIEW'
