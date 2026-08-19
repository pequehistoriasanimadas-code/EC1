$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Runtime = Join-Path $Root 'runtime'
$Temp = Join-Path $Root '.runtime-temp'
New-Item -ItemType Directory -Force -Path $Runtime,$Temp | Out-Null

Write-Host '== Preparando Python portable para Kokoro =='
$pyRoot = & python -c "import sys; print(sys.base_prefix)"
$pyDest = Join-Path $Runtime 'python'
if (Test-Path $pyDest) { Remove-Item $pyDest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pyDest | Out-Null
robocopy $pyRoot $pyDest /E /XD __pycache__ /XF *.pyc | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy Python falló: $LASTEXITCODE" }
& (Join-Path $pyDest 'python.exe') -m pip install --disable-pip-version-check --no-warn-script-location --upgrade "kokoro-onnx==0.5.0" soundfile misaki-fork

Write-Host '== Descargando modelos Kokoro =='
$kokoroDir = Join-Path $Runtime 'kokoro'
New-Item -ItemType Directory -Force -Path $kokoroDir | Out-Null
Invoke-WebRequest -Uri 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx' -OutFile (Join-Path $kokoroDir 'kokoro-v1.0.int8.onnx')
Invoke-WebRequest -Uri 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' -OutFile (Join-Path $kokoroDir 'voices-v1.0.bin')
Copy-Item (Join-Path $Root 'scripts\tts.py') (Join-Path $kokoroDir 'tts.py') -Force

Write-Host '== Descargando llama.cpp Windows CUDA 12.4 =='
$llamaDir = Join-Path $Runtime 'llama'
if (Test-Path $llamaDir) { Remove-Item $llamaDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $llamaDir | Out-Null
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest' -Headers @{ 'User-Agent'='EC-Automatic-News-Build' }
$binAsset = $release.assets | Where-Object { $_.name -match '^llama-.*bin-win-cuda-12\.4-x64\.zip$' } | Select-Object -First 1
$cudartAsset = $release.assets | Where-Object { $_.name -match '^cudart-llama-bin-win-cuda-12\.4-x64\.zip$' } | Select-Object -First 1
if (-not $binAsset) {
  Write-Warning 'No se encontró build CUDA 12.4; usando CPU x64.'
  $binAsset = $release.assets | Where-Object { $_.name -match '^llama-.*bin-win-cpu-x64\.zip$' } | Select-Object -First 1
}
if (-not $binAsset) { throw 'No se encontró un asset Windows x64 de llama.cpp.' }
$z1=Join-Path $Temp $binAsset.name
Invoke-WebRequest -Uri $binAsset.browser_download_url -OutFile $z1
Expand-Archive -Path $z1 -DestinationPath $llamaDir -Force
if ($cudartAsset) {
  $z2=Join-Path $Temp $cudartAsset.name
  Invoke-WebRequest -Uri $cudartAsset.browser_download_url -OutFile $z2
  Expand-Archive -Path $z2 -DestinationPath $llamaDir -Force
}

Write-Host '== Verificación runtime =='
$server = Get-ChildItem $llamaDir -Recurse -Filter 'llama-server.exe' | Select-Object -First 1
if (-not $server) { throw 'llama-server.exe no encontrado tras extraer runtime.' }
$py = Join-Path $pyDest 'python.exe'
if (-not (Test-Path $py)) { throw 'python.exe portable no encontrado.' }
if (-not (Test-Path (Join-Path $kokoroDir 'kokoro-v1.0.int8.onnx'))) { throw 'Modelo Kokoro no encontrado.' }
Write-Host "Runtime listo: $($server.FullName)"
Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
