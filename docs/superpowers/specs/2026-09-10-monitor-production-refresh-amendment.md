# Lab.27 — Enmienda: monitor activo durante producción

## Contexto

Durante la prueba de Lab.26 se reprodujo una limitación del monitor local: cuando la preparación de noticias marca `gpuStageBusy`, `voiceBusy` o `aiBusy`, `renderer-lan-output.js` deja de solicitar capturas del Output y conserva el último frame. Por eso el monitor parece congelado aunque no se esté ejecutando el optimizador.

El backend `captureOutputMonitorFrame()` solo necesita suspender el monitor durante la suspensión explícita de benchmark/optimización. La producción normal de IA/TTS no debe bloquear la previsualización.

## Comportamiento aprobado

El monitor de emisión debe continuar actualizándose durante:

- preparación/producción de noticias;
- etapas IA;
- etapas TTS;
- producción + emisión simultáneas;
- salida NDI activa;
- Output LAN activo.

El monitor solo puede suspenderse durante la optimización/benchmark explícito que activa `outputBenchmarkSuspended` / `optimizerActive`.

## Corrección

Eliminar la salida temprana del refresco del monitor basada en `gpuStageBusy`, `voiceBusy` o `aiBusy`. Mantener:

- el guard de pestaña visible;
- el guard `monitorBusy` para impedir capturas solapadas;
- el intervalo actual cercano a 900 ms;
- la suspensión de benchmark/optimización;
- el comportamiento del audio de monitor sin cambios.

No crear un segundo Output ni un segundo renderer para resolverlo.

## Regresiones obligatorias

Añadir comprobaciones que garanticen:

1. `aiBusy=true` no impide solicitar `outputMonitorFrame`.
2. `voiceBusy=true` no impide solicitar `outputMonitorFrame`.
3. `gpuStageBusy=true` no impide solicitar `outputMonitorFrame`.
4. `optimizerActive=true` sí mantiene la suspensión del monitor.
5. La ruta backend `outputBenchmarkSuspended` sigue devolviendo `suspended:true`.
6. El monitor continúa mostrando cambios de Output mientras producción y emisión están activas.
7. NDI, LAN, cola, Output local y controles de producción/emisión no cambian por esta corrección.

## Criterio de aceptación

Esta corrección forma parte de Lab.27 y debe estar incluida en la misma matriz de CI antes de generar el artefacto de prueba. No se considera Lab.27 terminada si el monitor vuelve a congelarse únicamente porque IA/TTS están ocupados.
