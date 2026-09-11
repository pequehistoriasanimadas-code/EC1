# GEC V2.0 TTS Lab.29 — Diseño de emisión, Salida y Promo YouTube

Fecha: 2026-09-11
Rama objetivo: `lab29-youtube-monitor-persistence`

## Objetivo

Reorganizar la interfaz de GEC sin perder ninguna función existente, separando claramente:

- **Diseño de emisión**: cómo se ve el Output.
- **Audio y locución**: cómo se escucha.
- **Salida**: cómo se distribuye la señal.

La modificación también debe ampliar el editor visual de Promo YouTube, corregir la activación desde la primera reproducción y conservar la estabilidad responsive actual de la ventana de control.

## Alcance funcional

### 1. Diseño de emisión

La pestaña se mantiene como editor visual y se reorganiza en dos columnas cuando haya ancho suficiente.

#### Columna izquierda

1. **Formato y estilo**
   - Formato de salida 16:9 / 9:16.
   - Badge de resolución.
   - Zona segura TikTok en 9:16.
   - Mostrar/ocultar guías de zona segura.
   - Fondo para videos 9:16.
   - Subir fondo 1080x1920.
   - Eliminar fondo.
   - Estado/ruta del fondo.
   - Animación de imagen: automática, zoom, pan vertical, pan horizontal, ninguna.
   - Velocidad: lenta, normal, rápida.

2. **Tipografías por elemento**
   - Titular.
   - Bajada.
   - Categoría.
   - Fecha.
   - Exclusivo.
   - Para cada elemento: familia, variante/peso, tamaño, mayúsculas y color.
   - Importar TTF/OTF.
   - Mostrar y eliminar tipografías personalizadas.

3. **Promo YouTube**
   - Mantener el CTA actual y su persistencia por perfil.
   - Añadir diseño visual separado para 16:9 y 9:16.
   - Posición predefinida.
   - Posición X.
   - Posición Y.
   - Escala general de la tarjeta.
   - Tamaño CTA.
   - Tamaño título.
   - Tamaño canal.
   - Texto CTA editable.
   - Opciones avanzadas:
     - opacidad de fondo,
     - tamaño relativo de miniatura,
     - radio de esquinas,
     - máximo de líneas del título.

#### Columna derecha

1. **Vista previa de emisión**
   - Mantener intacta la preview WYSIWYG actual de notas.
   - Mantener imagen actual o fallback.
   - Mantener Categoría, Fecha, Exclusivo, Titular y Bajada.
   - Mantener movimiento de imagen.
   - Mantener guías de zona segura.
   - Añadir selector `Nota | Promo YouTube`.
   - Al editar Promo YouTube, la preview puede cambiar automáticamente a Promo.
   - Al editar Formato/Tipografías/Fondos, puede volver a Nota.
   - El selector manual siempre debe seguir disponible.

2. **Transiciones**
   - Mantener Fundido / Sin transición.
   - Mantener duración.
   - Conservar el comportamiento operativo existente.

3. **Fondos y casillas**
   - Mover visualmente el bloque existente desde la izquierda a la derecha.
   - Mantener los mismos IDs, listeners y lógica.
   - Categoría: color, radio y opacidad.
   - Exclusivo: color, radio y opacidad.
   - Franja inferior: color y opacidad.
   - No añadir una casilla de Fecha: Fecha se mantiene solo como elemento tipográfico.

4. **Video de espera del Output**
   - Colocarlo debajo de Fondos y casillas.
   - Mantener seleccionar/cambiar video.
   - Mantener quitar video.
   - Mantener estado configurado/no configurado.
   - Mantener loop automático, fallback negro y transición existente.

### 2. Nueva pestaña Salida

Crear una nueva navegación principal `Salida` entre Diseño de emisión y Audio y locución.

#### Resumen de Output maestro

Panel de estado, no una segunda fuente de configuración:

- Estado del Output local.
- Resolución/formato actual.
- Estado del monitor local.
- Estado de Output LAN y número de conexiones.
- Estado NDI y número de receptores.
- Acción para abrir/mostrar Output.

Debe comunicar visualmente la arquitectura:

`Output maestro -> Monitor local / Output LAN / NDI`

#### Permisos de red

Mover el panel existente desde Diseño de emisión a Salida sin recrear su lógica:

- Estado NDI/LAN.
- Firewall.
- UAC.
- Botón de configuración.

#### Output por red local

Mover el panel existente sin duplicarlo:

- Activar/desactivar.
- Puerto.
- Número de conexiones.
- URL.
- Copiar enlace.
- Aplicar.

#### Salida NDI

Mover el panel existente sin duplicarlo:

- Activar/desactivar NDI.
- Nombre de fuente.
- FPS.
- Audio.
- Receptores.
- Formato.
- Aplicar.

### 3. Audio y locución

No mover ni duplicar controles de sonido.

La tarjeta de Música y mezcla y el resto de opciones de voz permanecen en `Audio y locución`.

## Promo YouTube — comportamiento de primera reproducción

Problema observado:

1. Promo estaba desactivada.
2. Un contenido quedó preparado/reservado.
3. Se activó Promo.
4. La primera reproducción del contenido no mostró tarjeta.
5. La segunda reproducción sí la mostró.

La causa probable es un snapshot `youtubePromo` calculado antes de la activación y reutilizado desde `currentCanned`.

### Comportamiento requerido

Resolver la Promo con el estado **actual** justo antes de reproducir el contenido:

1. Contenido reservado.
2. Leer perfil activo actual.
3. Leer configuración YouTube actual.
4. Resolver vínculo/metadata actual sin volver a consultar YouTube innecesariamente.
5. Resolver diseño efectivo 16:9/9:16 actual.
6. Crear snapshot de Promo.
7. Enviar al Output.

Casos obligatorios:

- Reservado con Promo OFF -> activar -> primera reproducción muestra Promo.
- Reservado con Promo ON -> desactivar -> primera reproducción no muestra Promo.
- Reservado -> cambiar escala/posición -> reproducción usa diseño nuevo.
- Anuncios nunca reciben `youtubePromo`.

## Persistencia

### Por perfil

Deben seguir siendo por perfil:

- activación de Promo,
- leadSeconds,
- enlaces y metadata de videos,
- diseño visual de Promo,
- Diseño de emisión,
- standby y demás valores ya profile-scoped.

### Global de máquina

La API Key de YouTube permanece fuera del perfil y no se exporta con el perfil.

### Estructura propuesta de diseño Promo

```js
visual.output.youtubePromoDesign = {
  ctaText: 'Puedes ver el video aquí:',
  formats: {
    '16:9': {
      position: 'bottom-left',
      xPercent: 4,
      yPercent: 5,
      scale: 1,
      ctaFontSize: 22,
      titleFontSize: 18,
      channelFontSize: 14,
      backgroundOpacity: 0.85,
      thumbnailScale: 1,
      borderRadius: 14,
      titleMaxLines: 2
    },
    '9:16': {
      position: 'bottom-left',
      xPercent: 5,
      yPercent: 8,
      scale: 0.9,
      ctaFontSize: 22,
      titleFontSize: 18,
      channelFontSize: 14,
      backgroundOpacity: 0.85,
      thumbnailScale: 1,
      borderRadius: 14,
      titleMaxLines: 2
    }
  }
}
```

El normalizador debe aceptar perfiles antiguos sin este objeto y aplicar defaults seguros.

## Restaurar diseño

No volver a reemplazar ciegamente todo `settings.visual.output`.

El reset debe operar sobre una lista explícita de claves visuales para evitar borrar accidentalmente:

- standbyVideo,
- rutas de archivos,
- links de YouTube,
- metadata,
- LAN/NDI,
- campos nuevos de versiones futuras.

El reset puede restablecer:

- formato visual,
- tipografías,
- colores,
- opacidades,
- radios,
- animación,
- diseño visual de Promo YouTube.

## Arquitectura de layout

No mover tarjetas durante `window.resize`.

Crear hosts estables una sola vez:

```text
Diseño de emisión
  #ecDesignLeft
  #ecDesignRight

Salida
  #ecOutputSummaryHost
  #ecNetworkPermissionsHost
  #ecLanOutputHost
  #ecNdiOutputHost
```

Los módulos actuales deben insertar/mover sus nodos una sola vez al inicializar. Los mismos nodos, IDs y listeners permanecen vivos después.

El responsive debe resolverse solo con CSS Grid/media queries.

## Responsive — requisito de aceptación

La estabilidad actual debe conservarse.

### Reglas

- Mantener `minmax(0,1fr)` en columnas principales.
- Mantener `min-width:0` en cards/children que puedan crecer.
- Mantener `flex-wrap` donde haya acciones.
- No introducir anchos mínimos rígidos en Promo YouTube.
- No reconstruir DOM al cambiar ancho.
- No añadir preview sticky en esta versión.
- Mantener el `ResizeObserver` actual de la preview WYSIWYG.
- Mantener los breakpoints existentes siempre que sea posible.

### Tamaños de prueba

Verificar como mínimo:

- 1500x940.
- 1366x768.
- 1250x800.
- 1200x800.
- 1181x800.
- 1180x800.
- 1179x800.
- 1100x720.

Y hacer redimensionamiento continuo:

`1500 -> 1300 -> 1181 -> 1180 -> 1100 -> 1180 -> 1500`

En cada tamaño:

- sin scroll horizontal global,
- sin cards fuera de `main`,
- sin inputs/selects superpuestos,
- sin controles cortados,
- preview conserva aspect ratio,
- 16:9 -> 9:16 -> 16:9 no rompe layout,
- nombres largos de fuentes no expanden la columna,
- nombres largos de standby no generan overflow,
- cambio de perfil con ventana reducida mantiene layout.

## Prevención de regresiones

### DOM e IDs

- No recrear LAN/NDI/Permisos con IDs nuevos salvo hosts.
- Mover/reinsertar los nodos existentes.
- Mantener listeners actuales.
- Hacer las inyecciones idempotentes.

### Preview

- No reemplazar `#designPreview`.
- Mantener su WYSIWYG actual y `ResizeObserver`.
- Añadir Promo como una segunda capa/vista controlada dentro del mismo host o contenedor compatible.

### YouTube

Actualmente existen más de una capa/wrapper alrededor de `playCanned`. Antes de ampliar la lógica se debe asegurar que exista un único punto autoritativo para resolver/incluir el snapshot de Promo o, como mínimo, que los wrappers sean idempotentes y estén cubiertos por tests de orden.

### Cambio de perfil

La nueva UI debe seguir reaccionando a `profile:changed`:

- refrescar diseño,
- refrescar Promo,
- refrescar LAN/NDI,
- no arrastrar valores de otro perfil.

### Perfiles antiguos

Los campos nuevos deben ser opcionales y normalizados con defaults.

## Pruebas requeridas

1. Regression de primera reproducción de Promo.
2. Regression OFF antes de reproducción.
3. Regression cambio de diseño Promo después de reservar contenido.
4. Anuncios sin Promo.
5. Persistencia por perfil de Promo visual.
6. Cambio de perfil sin contaminación cruzada.
7. Import/export de perfil: diseño Promo viaja, API Key no.
8. Fondos y casillas conservan valores después del traslado visual.
9. Standby conserva selección/loop/transición.
10. Permisos, LAN y NDI siguen operativos después de moverlos a Salida.
11. Output/Monitor/LAN/NDI muestran la misma señal visual.
12. Responsive en todos los tamaños definidos.
13. Responsive cruzando repetidamente el breakpoint.
14. `Restaurar diseño` no borra standby ni datos no visuales.
15. Startup smoke y tests existentes continúan verdes.

## No objetivos

- No rediseñar Audio y locución.
- No reactivar controles antiguos ocultos de Exclusivo.
- No cambiar el motor de Output.
- No crear una segunda composición independiente para LAN o NDI.
- No añadir una preview sticky.
- No reescribir el editor tipográfico que ya funciona.

## Criterio de terminado

El cambio se considera terminado solo si:

- todas las funciones actuales de Diseño siguen disponibles,
- Promo funciona en la primera reproducción posterior a un cambio de estado,
- la nueva pestaña Salida funciona sin duplicados,
- perfiles antiguos siguen cargando,
- no hay regresiones en standby/LAN/NDI/preview,
- el layout no se rompe entre 1100x720 y 1500x940,
- los tests y workflow de GitHub Actions quedan en verde.
