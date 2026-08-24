# EC Automatic News 0.3.11 — Windows Portable

EC Automatic News es una aplicación Electron para preparar y emitir noticias de forma continua desde una ventana **Control** hacia una ventana **Output** capturable en OBS.

## Funciones principales de 0.3.11

- Múltiples RSS con prueba, activación/desactivación, deduplicación y orden por fecha.
- Lectura de artículos y detección de imagen principal.
- Proveedores de IA seleccionables: **Qwen local**, **Claude Haiku 4.5** y **Gemini**, con respaldos configurables.
- Claude queda fijado explícitamente a `claude-haiku-4-5-20251001`; la prueba de conexión usa el mismo modelo que la generación real.
- Qwen 8B local mediante llama.cpp incluido en la build. El modelo GGUF se descarga una sola vez desde la propia aplicación (~5 GB).
- llama.cpp de la build fijado a una versión conocida en lugar de descargar automáticamente cualquier release nueva.
- Kokoro local incluido, con selección de voces, velocidad y perfiles de consumo de CPU.
- Normalizador de pronunciación con reglas locales, Qwen 0.6B opcional y verificación automática con Claude Haiku 4.5 cuando hay una API Key configurada.
- Aprendizaje persistente de pronunciaciones en `EC Automatic News Data/pronunciation-learning.json`, con migración automática desde el caché anterior, exportación e importación.
- Preview de diseño 16:9 / 9:16 con tipografía, fecha, colores, safe zones y movimiento de imagen.
- Emisión automática separada del procesamiento, con buffer de noticias listas, pausa/reanudación y un reintento de audio defectuoso.
- **Contenidos** y **Anuncios** como bibliotecas independientes. Los contenidos programados se insertan en múltiplos exactos del total de noticias emitidas y un anuncio puede reproducirse después de cada contenido completado.
- Contadores visibles independientes de la programación interna, para que reiniciar estadísticas no altere el siguiente contenido programado.
- Preload único y sandbox seguro (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
- Self-test de Windows que comprueba Kokoro, voces, normalización Unicode y el bridge real Control/Output antes de publicar el artifact.

## Compilar en GitHub Actions

1. Abre **Actions** → **Build Windows Portable**.
2. Ejecuta el workflow o realiza un push a `main`.
3. El runner prepara llama.cpp + Kokoro, ejecuta `npm run check`, compila el portable y ejecuta el self-test del EXE.
4. Si todo termina correctamente, descarga el artifact **EC-Automatic-News-Windows-Portable-EXE** o la carpeta portable completa.

No necesitas instalar Node, Python ni llama.cpp en la computadora donde usarás la aplicación.

## Primer uso

- **Claude:** coloca la API Key en Ajustes y usa **Guardar y probar Claude Haiku 4.5**.
- **Gemini:** coloca la API Key si deseas usarlo como proveedor principal o respaldo.
- **Kokoro:** viene incluido en la build y las voces disponibles se cargan automáticamente en Ajustes.
- **Qwen 8B:** pulsa **Descargar Qwen 8B (~5 GB)** si deseas usar IA generativa local.
- **Pronunciación Qwen 0.6B:** es opcional y se descarga desde Ajustes. Si Claude está configurado, puede validar automáticamente términos nuevos.
- **Aprendizaje de pronunciación:** permanece en la carpeta `EC Automatic News Data` al actualizar el EXE en la misma ubicación. Usa Exportar/Importar como respaldo o para cambiar de computadora.
- Añade los RSS, configura el diseño, abre Output y selecciónalo en OBS mediante Captura de ventana.

## Datos persistentes

La aplicación separa el ejecutable de sus datos. En modo portable utiliza:

`EC Automatic News Data/`

Ahí se conservan ajustes, modelos descargados, historial, aprendizaje de pronunciación, audios temporales y logs. Sustituir el EXE por una versión más nueva en la misma carpeta no debe borrar estos datos.

## Diagnóstico

Si la aplicación no abre o una función principal falla, ejecuta `DIAGNOSTICO.cmd` y revisa:

`EC Automatic News Data/logs/startup.log`

La build también incluye un self-test automatizado para evitar publicar una versión cuyo bridge de Electron, selector de voces u Output no puedan inicializarse.

## Avisos

- El EXE no está firmado digitalmente; Windows SmartScreen puede mostrar una advertencia.
- Los modelos Qwen ocupan varios GB y se descargan aparte del ejecutable.
- Claude y Gemini pueden generar costos o límites según la cuenta del usuario.
- Respeta los derechos y licencias de los textos, imágenes, música, contenidos y anuncios que emitas.
