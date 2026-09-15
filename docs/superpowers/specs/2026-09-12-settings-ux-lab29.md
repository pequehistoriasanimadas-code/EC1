# Ajustes UX Lab29 — Especificación

## Objetivo

Reorganizar la pestaña **Ajustes** de GEC V2.0 TTS Lab para reducir verticalidad y mejorar jerarquía visual sin cambiar la lógica funcional existente ni introducir opciones nuevas.

## Alcance aprobado

1. Mantener **Optimización automática de GEC** exactamente con su diseño actual y a ancho completo en la parte superior.
2. Mantener **Fuentes de noticias** con su UX original actual:
   - contador de fuentes,
   - texto explicativo,
   - lista con scroll interno,
   - tarjetas compactas de fuente,
   - estado visual,
   - Editar / Pausar-Reactivar / Eliminar,
   - edición expandida en la misma tarjeta,
   - Tipo de fuente + Acceso al contenido en dos columnas cuando haya espacio,
   - botón `+ Añadir fuente`,
   - Cierre para fuentes parciales,
   - Cierre para contenido exclusivo.
3. Mantener una disposición general de **dos columnas** para Ajustes.
4. Columna izquierda:
   - Fuentes de noticias,
   - Imagen de respaldo,
   - Apariencia de la cola.
5. Columna derecha, en este orden:
   - IA local,
   - Servicio de IA,
   - Proveedores de IA (Claude + Gemini).
6. **IA local** debe conservar sus controles reales existentes. La política de respaldo solo debe mostrarse cuando IA local esté configurada efectivamente como Respaldo 1 o Respaldo 2.
7. **Servicio de IA** debe mostrar Principal / Respaldo 1 / Respaldo 2 en una misma fila cuando el ancho lo permita.
8. **Claude y Gemini** deben mostrarse lado a lado en escritorio, reutilizando exactamente los controles e IDs existentes.
9. **Apariencia de la cola** debe compactarse horizontalmente y conservar todos los colores actualmente soportados, incluido `Exclusivos`.
10. La UI legacy de **Redacción de noticias / Prompt editorial avanzado** no debe mostrarse en Ajustes. Sus nodos pueden permanecer ocultos para no romper carga/guardado legacy.
11. Voz, Pronunciación, Gestión de aprendizaje, Música y mezcla siguen perteneciendo a **Audio y locución**, no a Ajustes.
12. No añadir una tarjeta general de “Opciones avanzadas”, perfiles Seguro/Equilibrado/Rendimiento, logs, inicio con Windows ni otras funciones no existentes.
13. No modificar `main` ni fusionar ramas sin aprobación explícita.

## Compatibilidad y regresiones a prevenir

- No duplicar IDs ni controles existentes.
- No clonar inputs: mover nodos existentes para conservar listeners y estado.
- No reconstruir `.feedrow`; el renderer actual sigue siendo la única autoridad de las tarjetas de fuente.
- `renderFeeds()` debe seguir pudiendo insertar/reutilizar `#globalPartialClose` y `#globalExclusiveClose` usando `#addFeed.closest('.card')`.
- `#queueColorExclusive`, inyectado por la capa 0.3.24, debe conservarse y permanecer dentro de la cuadrícula de colores.
- `saveSettings()` debe seguir encontrando `#editorialPrompt` y `#editorialInstructions`; por eso la UI editorial legacy se oculta, no se destruye.
- Los wrappers nuevos no deben modificar `#ecOptimizer0321` ni su CSS.
- La capa de Ajustes debe esperar a que Audio ya haya reclamado los controles de voz/pronunciación antes de ocultar las tarjetas legacy de Settings.
- El layout no debe reparentar por evento `resize`; responsive solo por CSS.
- Mantener dos columnas en el ancho mínimo normal de la app (1100 px). El colapso a una columna debe quedar por debajo de ese ancho.
- Conservar compatibilidad con perfiles antiguos y con los listeners actuales de Claude, Gemini, IA local, RSS/WEB, cierres y colores.

## Arquitectura

Añadir una capa UX Lab29 específica de Ajustes que se inyecta después de cargar la UI existente. Esa capa crea únicamente contenedores de presentación y **reubica controles reales existentes**. Las dos tarjetas legacy originales permanecen ocultas como contenedores de compatibilidad; no se elimina lógica ni se reescriben handlers.

La capa consta de:

- `src/renderer-settings-ux-lab29.js`: espera dependencias, crea el workspace y mueve nodos existentes.
- `src/control-settings-ux-lab29.css`: grid de dos columnas, compactación de Servicio de IA, Proveedores y colores, sin tocar tarjetas `.feedrow`.
- `scripts/check-v2lab-settings-ux-lab29.js`: regresiones estáticas de estructura, cableado, preservación de exclusivas y ausencia de reparenting por resize.
- `src/services/releaseV2UxRepairLab29.js`: inyección de los dos nuevos assets.
- `package.json`: syntax check + ejecución del check dedicado dentro de `npm run check`.

## Criterios de aceptación

- Optimización automática visualmente intacta.
- Fuentes de noticias visualmente intactas, compactas y funcionales.
- Cierres parcial y exclusivo presentes.
- IA local es la primera tarjeta de la derecha.
- Servicio de IA es la segunda.
- Claude/Gemini son la tercera sección y aparecen en paralelo en escritorio.
- Redacción/Prompt editorial no aparecen en Ajustes.
- Apariencia de cola ocupa menos altura y mantiene Noticias, Notas, Exclusivos, Contenidos, Anuncios y Errores.
- `npm run check` pasa.
- Lab29 static diagnostics pasa.
- Windows Portable pasa.
- No se reporta como final hasta que los checks del commit final estén en verde.
