$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Runtime = Join-Path $Root 'runtime'
$Temp = Join-Path $Root '.runtime-temp'
New-Item -ItemType Directory -Force -Path $Runtime,$Temp | Out-Null

function Download-File {
  param([Parameter(Mandatory=$true)][string]$Url,[Parameter(Mandatory=$true)][string]$OutFile)
  Write-Host "Descargando: $Url"
  & curl.exe -L --fail --retry 5 --retry-delay 5 --connect-timeout 30 --max-time 900 --output $OutFile $Url
  if ($LASTEXITCODE -ne 0) { throw "curl falló ($LASTEXITCODE): $Url" }
  if (-not (Test-Path $OutFile)) { throw "No se creó el archivo esperado: $OutFile" }
}

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
Download-File 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx' (Join-Path $kokoroDir 'kokoro-v1.0.int8.onnx')
Download-File 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' (Join-Path $kokoroDir 'voices-v1.0.bin')
Copy-Item (Join-Path $Root 'scripts\tts.py') (Join-Path $kokoroDir 'tts.py') -Force

Write-Host '== Descargando llama.cpp Windows Vulkan x64 =='
$llamaDir = Join-Path $Runtime 'llama'
if (Test-Path $llamaDir) { Remove-Item $llamaDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $llamaDir | Out-Null
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest' -Headers @{ 'User-Agent'='EC-Automatic-News-Build' }
$binAsset = $release.assets | Where-Object { $_.name -match '^llama-.*bin-win-vulkan-x64\.zip$' } | Select-Object -First 1
if (-not $binAsset) {
  Write-Warning 'No se encontró build Vulkan; usando CPU x64.'
  $binAsset = $release.assets | Where-Object { $_.name -match '^llama-.*bin-win-cpu-x64\.zip$' } | Select-Object -First 1
}
if (-not $binAsset) { throw 'No se encontró un asset Windows x64 de llama.cpp.' }
Write-Host "Asset seleccionado: $($binAsset.name)"
$z1 = Join-Path $Temp $binAsset.name
Download-File $binAsset.browser_download_url $z1
Write-Host "ZIP descargado: $([math]::Round((Get-Item $z1).Length / 1MB, 1)) MB"
Expand-Archive -Path $z1 -DestinationPath $llamaDir -Force

Write-Host '== Verificación runtime =='
$server = Get-ChildItem $llamaDir -Recurse -Filter 'llama-server.exe' | Select-Object -First 1
if (-not $server) { throw 'llama-server.exe no encontrado tras extraer runtime.' }
$py = Join-Path $pyDest 'python.exe'
if (-not (Test-Path $py)) { throw 'python.exe portable no encontrado.' }
if (-not (Test-Path (Join-Path $kokoroDir 'kokoro-v1.0.int8.onnx'))) { throw 'Modelo Kokoro no encontrado.' }
Write-Host "Runtime listo: $($server.FullName)"
Write-Host 'Backend local preferido: Vulkan (compatible con NVIDIA/AMD/Intel mediante drivers gráficos de Windows).'
Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
