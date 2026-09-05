$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Runtime = Join-Path $Root 'runtime'
$Temp = Join-Path $Root '.runtime-temp'
$LlamaRelease = 'b10218'
New-Item -ItemType Directory -Force -Path $Runtime,$Temp | Out-Null

function Download-File {
  param([Parameter(Mandatory=$true)][string]$Url,[Parameter(Mandatory=$true)][string]$OutFile,[int]$MaxSeconds=900)
  Write-Host "Descargando: $Url"
  & curl.exe -L --fail --retry 5 --retry-delay 5 --connect-timeout 30 --max-time $MaxSeconds --output $OutFile $Url
  if ($LASTEXITCODE -ne 0) { throw "curl falló ($LASTEXITCODE): $Url" }
  if (-not (Test-Path $OutFile)) { throw "No se creó el archivo esperado: $OutFile" }
  if ((Get-Item $OutFile).Length -le 0) { throw "Archivo vacío: $OutFile" }
}

Write-Host '== Preparando Python portable para Kokoro y TTS Lab =='
$pyRoot = & python -c "import sys; print(sys.base_prefix)"
$pyDest = Join-Path $Runtime 'python'
if (Test-Path $pyDest) { Remove-Item $pyDest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pyDest | Out-Null
robocopy $pyRoot $pyDest /E /XD __pycache__ /XF *.pyc | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy Python falló: $LASTEXITCODE" }
& (Join-Path $pyDest 'python.exe') -m pip install --disable-pip-version-check --no-warn-script-location --upgrade "kokoro-onnx==0.5.0" soundfile misaki-fork
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias de Kokoro.' }

Write-Host '== Descargando modelos Kokoro =='
$kokoroDir = Join-Path $Runtime 'kokoro'
New-Item -ItemType Directory -Force -Path $kokoroDir | Out-Null
Download-File 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx' (Join-Path $kokoroDir 'kokoro-v1.0.int8.onnx')
Download-File 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' (Join-Path $kokoroDir 'voices-v1.0.bin')
Copy-Item (Join-Path $Root 'scripts\tts.py') (Join-Path $kokoroDir 'tts.py') -Force

Write-Host '== Preparando worker de GEC V2.0 TTS Lab =='
$ttsLabDir = Join-Path $Runtime 'tts-lab'
if (Test-Path $ttsLabDir) { Remove-Item $ttsLabDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ttsLabDir | Out-Null
Copy-Item (Join-Path $Root 'src\tts_lab_worker.py') (Join-Path $ttsLabDir 'tts_lab_worker.py') -Force
if (-not (Test-Path (Join-Path $ttsLabDir 'tts_lab_worker.py'))) { throw 'No se pudo preparar el worker de TTS Lab.' }

Write-Host "== Descargando llama.cpp Windows x64 fijado en $LlamaRelease =="
$llamaDir = Join-Path $Runtime 'llama'
if (Test-Path $llamaDir) { Remove-Item $llamaDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $llamaDir | Out-Null
$baseUrl = "https://github.com/ggml-org/llama.cpp/releases/download/$LlamaRelease"
$vkName = "llama-$LlamaRelease-bin-win-vulkan-x64.zip"
$cpuName = "llama-$LlamaRelease-bin-win-cpu-x64.zip"
$zip = Join-Path $Temp $vkName
try {
  Download-File "$baseUrl/$vkName" $zip
  Write-Host "Runtime seleccionado: Vulkan x64 ($LlamaRelease)"
} catch {
  Write-Warning "Vulkan no pudo descargarse: $($_.Exception.Message)"
  $zip = Join-Path $Temp $cpuName
  Download-File "$baseUrl/$cpuName" $zip
  Write-Host "Runtime seleccionado: CPU x64 ($LlamaRelease)"
}
Write-Host "ZIP descargado: $([math]::Round((Get-Item $zip).Length / 1MB, 1)) MB"
Expand-Archive -Path $zip -DestinationPath $llamaDir -Force

Write-Host '== Verificación runtime =='
$server = Get-ChildItem $llamaDir -Recurse -Filter 'llama-server.exe' | Select-Object -First 1
if (-not $server) { throw 'llama-server.exe no encontrado tras extraer runtime.' }
$py = Join-Path $pyDest 'python.exe'
if (-not (Test-Path $py)) { throw 'python.exe portable no encontrado.' }
$kokoroModel = Join-Path $kokoroDir 'kokoro-v1.0.int8.onnx'
$voicesModel = Join-Path $kokoroDir 'voices-v1.0.bin'
if (-not (Test-Path $kokoroModel)) { throw 'Modelo Kokoro no encontrado.' }
if (-not (Test-Path $voicesModel)) { throw 'Archivo de voces Kokoro no encontrado.' }
# El modelo int8 oficial pesa ~88 MB; 80 MB detecta descargas truncadas sin rechazar el asset válido.
if ((Get-Item $kokoroModel).Length -lt 80MB) { throw 'Modelo Kokoro parece incompleto.' }
if ((Get-Item $voicesModel).Length -lt 1MB) { throw 'Archivo de voces Kokoro parece incompleto.' }
Write-Host "Runtime listo: $($server.FullName)"
Write-Host "llama.cpp fijado: $LlamaRelease"
Write-Host 'TTS Lab listo para instalar Chatterbox/Qwen3-TTS bajo demanda, sin inflar el EXE base.'
Write-Host 'Backend local preferido: Vulkan; fallback CPU x64 si el asset Vulkan no está disponible.'
Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
