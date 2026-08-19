# EC Automatic News — build automático para Windows

Este repositorio está preparado para que **GitHub Actions compile por ti** una versión portable de Windows. Tú no necesitas instalar Node, Python ni herramientas de desarrollo en tu PC para compilarla.

## Qué funciona en esta versión

- Aplicación de escritorio Electron con ventanas **Control** y **Output**.
- Múltiples RSS con prueba, activación/desactivación, deduplicación y orden por fecha.
- Lectura del artículo y detección de imagen principal.
- Proveedores seleccionables: **IA local (Qwen)**, **Claude API** y **Gemini API**, con dos respaldos.
- Claude y Gemini usan sus APIs reales y detectan modelos disponibles si el campo de modelo se deja vacío.
- IA local con **llama.cpp incluido en la build**. El modelo Qwen no va dentro del EXE: desde la propia aplicación se descarga una sola vez (~5.03 GB) a la carpeta portable. No instala Ollama ni ningún servicio en Windows.
- **Kokoro local incluido en la build**, con Python portable privado dentro de la aplicación. El usuario no instala Python.
- Preview con audio.
- Modo automático con buffer: procesa RSS → IA → Kokoro → Output → pausa → siguiente.
- En automático usa **solo la imagen principal**; si no existe o falla, usa la imagen fallback que suba el usuario.
- Output amarillo / negro / blanco, sin logo de EC Automatic News.
- Animación de imágenes en tiempo real por código; no genera MP4.

## Compilar sin instalar nada en tu PC

1. Crea un repositorio en GitHub.
2. Sube todo el contenido de esta carpeta manteniendo `.github/workflows/`.
3. En GitHub abre **Actions** → **Build Windows Portable**.
4. Pulsa **Run workflow**.
5. Cuando termine, abre el workflow y descarga el artifact **EC-Automatic-News-Windows-Portable**.
6. Dentro estará `EC-Automatic-News-Portable-0.2.0.exe`.

GitHub Actions usa un runner `windows-latest`, instala las herramientas solo en esa máquina temporal, prepara llama.cpp + Kokoro y compila Electron. Nada de eso se instala en tu computadora.

## Primer uso del EXE

- Claude/Gemini: coloca la API Key en Ajustes y puedes empezar de inmediato.
- Kokoro: ya debe venir incluido en el EXE generado por Actions.
- IA local: pulsa **Descargar Qwen 8B (~5 GB)**. Es una descarga dentro de `EC Automatic News Data`, no una instalación del sistema. Después puede funcionar localmente.
- Sube tu imagen fallback 1080x1920.
- Añade los RSS deseados.
- Abre Output y selecciónalo en OBS mediante Captura de ventana.

## Publicar una Release

El repositorio también incluye `.github/workflows/release-windows.yml`. Si creas un tag como `v0.2.0`, GitHub compila el portable y lo adjunta automáticamente a una Release.

## Avisos

- El EXE no está firmado digitalmente, por lo que Windows SmartScreen puede mostrar una advertencia. Esto no es una dependencia faltante.
- La IA local Qwen ocupa ~5 GB y se descarga aparte para evitar un ejecutable gigantesco.
- Las APIs Claude/Gemini pueden tener costos o límites según tu cuenta.
- Respeta los derechos/licencias de las imágenes y textos que emitas.
