# GEC V2.0 TTS Lab.29 — Diseño de emisión V2

Fecha: 2026-09-12
Rama objetivo: `lab29-youtube-monitor-persistence`

## Objetivo

Refinar `Diseño de emisión` sin alterar la arquitectura de Output maestro/LAN/NDI: separar el formato global de los editores `Nota` y `Promo YouTube`, mantener diseños independientes 16:9/9:16, corregir la regresión de selección de fuentes y mejorar el editor geométrico de Promo.

## Jerarquía de UX

1. `Formato de salida` es global y permanece visible siempre.
2. Selector de modo: `Nota | Promo YouTube`.
3. Columna izquierda: solo ajustes del modo activo.
4. Columna derecha: preview del modo activo, seguido por `Transiciones` y `Video de espera`.
5. Responsive por CSS, sin reconstruir DOM en resize y sin preview sticky.

## Formato global

- Horizontal 16:9 / Vertical 9:16.
- Resolución correspondiente.
- En 9:16: Zona segura TikTok, guías y fondo para videos verticales.
- `Zona segura TikTok` restringe físicamente la Promo en 9:16 aunque las guías estén ocultas.

## Nota

`visual.output.noteDesign.formats['16:9']` y `['9:16']` son independientes.

Cada formato conserva:

- animación de imagen y velocidad;
- tipografías por elemento: Titular, Bajada, Categoría, Fecha y Exclusivo;
- familia, variante, tamaño numérico, mayúsculas y color;
- fondos/casillas de Categoría, Exclusivo y Franja inferior;
- visibilidad independiente de Categoría, Fecha y Exclusivo mediante checkbox etiquetado solo `Categoría`, `Fecha`, `Exclusivo`.

Ocultar un elemento no borra su configuración. `Exclusivo` es visibilidad puramente gráfica y nunca cambia la clasificación editorial ni la frecuencia de exclusivas.

Las fuentes base `Arial`, `Segoe UI`, `Verdana`, `Georgia`, `Impact` deben ser seleccionables desde el primer arranque sin importar ninguna TTF/OTF. Importar una fuente solo agrega opciones.

## Promo YouTube

`visual.output.youtubePromoDesign.formats['16:9']` y `['9:16']` son independientes.

### Posición

Presets:

- Superior izquierda
- Centro superior
- Superior derecha
- Inferior izquierda
- Centro inferior
- Inferior derecha
- Personalizado (estado automático cuando se modifica X/Y)

Los presets actualizan X/Y. X/Y se editan mediante slider + número sincronizados.

### Geometría

- Sustituir `scale` como control principal por `widthPercent` y `minHeightPercent`.
- No usar `scaleX/scaleY`; nunca deformar tipografía ni miniatura.
- El título hace wrap natural según ancho de tarjeta; no exponer `Máximo de líneas`.
- Si el contenido excede físicamente el área disponible, aplicar protección de overflow automática.
- La tarjeta nunca puede salir del área permitida.
- En 9:16 con TikTok Safe ON, el área permitida es la zona segura; con OFF, es todo el frame.
- Los valores persistidos son los valores normalizados efectivos, no coordenadas imposibles.

### Opciones avanzadas

Siempre visibles fuera de avanzado:

- CTA editable
- presets de posición
- X/Y slider + número
- ancho de tarjeta slider + número
- alto mínimo slider + número

Avanzado:

- tamaño CTA numérico
- tamaño título numérico
- tamaño canal numérico
- tamaño de miniatura slider + número
- opacidad de fondo slider + número
- radio de esquinas numérico
- padding interno slider + número
- separación miniatura/texto numérico

## Persistencia y migración

- El diseño continúa siendo por perfil.
- Perfiles legacy sin `noteDesign` copian una sola vez el diseño plano actual a 16:9 y 9:16.
- Promo legacy se migra preservando apariencia razonable y luego queda independiente por formato.
- El formato actual sigue en `visual.output.format`.
- Para compatibilidad, al leer settings se materializa el Note Design del formato activo sobre los campos legacy planos que consume el Output actual.
- No mantener dos escritores autoritativos: el editor nuevo escribe la estructura por formato y deriva la vista legacy efectiva.

## Reset

Reset contextual por modo/formato:

- Restaurar Nota 16:9 / Nota 9:16.
- Restaurar Promo 16:9 / Promo 9:16.

Nunca borrar standby, fondo vertical, música, enlaces/metadata YouTube, API keys, LAN, NDI ni otros campos operativos.

## Preview y Output

- Selector `Nota | Promo YouTube` controla tanto controles visibles como preview.
- Entrar en Diseño de emisión comienza en `Nota`.
- Preview y Output usan el mismo modelo normalizado.
- Promo real continúa resolviéndose justo antes de reproducir contenido.
- Anuncios nunca reciben Promo.
- Output local, Monitor, LAN y NDI consumen la misma señal maestra.

## Responsive

Mantener hosts estables, `minmax(0,1fr)`, `min-width:0`, flex-wrap donde corresponda y breakpoint aproximado de 1180 px. Verificar 1500×940, 1366×768, 1250×800, 1200×800, 1181×800, 1180×800, 1179×800 y 1100×720, además de la secuencia 1500→1300→1181→1180→1100→1180→1500.

## Regresiones obligatorias

- fuentes base seleccionables sin TTF custom;
- importación custom no desbloquea ni reemplaza las fuentes base;
- Nota 16:9 y 9:16 no se contaminan;
- Promo 16:9 y 9:16 no se contaminan;
- checkbox de Exclusivo no altera semántica editorial;
- visibilidad no borra estilos;
- seis presets + Personalizado;
- safe zone 9:16 restringe la geometría;
- slider/número siempre sincronizados con valor normalizado;
- título largo no sale del frame;
- preview y Output coinciden;
- primera reproducción de Promo mantiene la corrección Lab.29;
- anuncios sin Promo;
- cambio de perfil sin contaminación;
- reset contextual preserva datos operativos;
- resize no recrea ni duplica DOM.
