# Audio y locución compact UX — implementation plan

## Goal
Compactar y ordenar Audio y locución sin perder diagnóstico de desarrollo, mantener un único selector de motor, conservar la prueba/reproductor de voz, soportar múltiples voces de referencia y asegurar que la voz seleccionada sea persistente por perfil.

## Architecture rules
- Reutilizar los nodos y APIs existentes; no duplicar controles ni fuentes de verdad.
- `referenceVoiceId` sigue siendo configuración por perfil en `tts-v2.json`.
- La biblioteca de referencias es compartida; solo la selección activa es por perfil.
- Pronunciación + Normalizador ES-PE + reglas actualizables siguen siendo pipeline común a Chatterbox/Qwen/Kokoro.
- Protección de ataque inicial sigue siendo específica de Kokoro.
- No introducir reparenting por resize; solo CSS responsive.
- Mantener `#v2VoicePreview` y las pruebas de consistencia.

## Regression risks and solutions
1. **Fuga de voz entre perfiles**: proteger `PROFILE_TTS_KEYS` y añadir gate de `referenceVoiceId` por perfil.
2. **Referencia faltante borrada indirectamente**: no convertir un id faltante en `''` al renderizar; mostrar opción “no disponible” conservando el id.
3. **Perder reproductor de prueba**: gate explícito sobre `#v2VoicePreview` y `testVoice()`.
4. **Romper múltiples referencias**: mantener `labStatus.voices` completo y lista dinámica; añadir reproducción individual sin cambiar selección.
5. **Confundir voces disponibles con rotación**: solo badge `ACTIVA`; nunca “Secundaria” ni rotación automática.
6. **Normalizador oculto en Chatterbox**: gate que comprueba que no existe condición por motor para ocultarlo.
7. **Diagnóstico Kokoro-céntrico**: UI debe decir “Texto enviado al motor TTS” y mostrar destino dinámico; conservar compatibilidad con campos históricos backend.
8. **Filas de aprendizaje demasiado altas**: acciones Guardar/Eliminar pasan a iconos accesibles con `title` y `aria-label`.
9. **Eliminar Probar pronunciación y perder diagnóstico**: conservar la función, pero moverla a un bloque plegable/avanzado para quitar ruido del flujo principal.
10. **Regresión responsive**: CSS grid estable, sin listeners de resize que muevan DOM.

## TDD tasks
1. Crear `scripts/check-v2lab-audio-ux-lab29.js` con assertions para los contratos anteriores y añadirlo a `npm run check`.
2. Confirmar RED en GitHub Actions por ausencia de implementación.
3. Implementar cambios mínimos en `renderer-0327.js`, `renderer-v2lab.js`, `control-0327.css`, `control-v2lab.css` y `ttsLabRuntime.js` solo donde sea necesario.
4. Ejecutar static diagnostics y corregir hasta GREEN.
5. Ejecutar Windows Portable + packaged smoke y corregir hasta GREEN.
6. Reportar head, runs y límites de validación manual (DPI/visual/audio real).
