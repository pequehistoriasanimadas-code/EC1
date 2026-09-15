# Diseño de emisión + Salida + Promo YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar Diseño de emisión, crear la nueva pestaña Salida, ampliar el editor visual de Promo YouTube y corregir la promo para que respete el estado/diseño actual desde la primera reproducción, sin perder la estabilidad responsive ni funciones existentes.

**Architecture:** Mantener los módulos actuales y añadir una capa de layout idempotente sobre los mismos nodos/IDs. La promo se resolverá en el último punto autoritativo antes de enviar el payload al Output usando el contenido actual re-decorado desde `CannedManager.list`, y el diseño visual se normalizará con un módulo puro compartido por runtime/tests. La preview WYSIWYG existente no se sustituye; se añade una capa Promo separada dentro del mismo host.

**Tech Stack:** Electron 43, Node.js, JavaScript CommonJS, HTML/CSS Grid, GitHub Actions, tests de regresión Node/assert/vm.

**Spec:** `docs/superpowers/specs/2026-09-11-emission-output-youtube-layout-design.md`

## Global Constraints

- Mantener todas las funciones actuales de Diseño de emisión.
- No mover ni duplicar Audio y locución.
- Mover Permisos de red, Output LAN y NDI a una nueva pestaña `Salida` conservando nodos, IDs y listeners.
- Mantener Video de espera en Diseño de emisión y colocarlo en la columna derecha.
- Mantener `#designPreview` y su `ResizeObserver` actual.
- No usar DOM reconstruction durante `window.resize`; responsive solo con CSS/media queries.
- Preservar perfiles antiguos y API Key de YouTube global de máquina.
- `Restaurar diseño` no debe borrar standby ni datos no visuales.
- El layout debe permanecer estable entre 1100×720 y 1500×940.

---

### Task 1: Añadir regresiones RED para promo fresca, layout y reset seguro

**Files:**
- Modify: `scripts/check-v2lab-youtube-promo.js`
- Create: `scripts/check-v2lab-emission-layout.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: runtime actual de Promo YouTube y DOM/CSS existentes.
- Produces: asserts que obligan a implementar `youtubePromoDesign`, resolución fresca al emitir, pestaña `Salida`, hosts estables y reset no destructivo.

- [ ] **Step 1: Escribir pruebas que fallen por las funciones nuevas**

Añadir en `check-v2lab-youtube-promo.js` asserts para:

```js
assert(stab.includes('freshYoutubePromoSnapshot'),'La promo debe resolverse justo antes de enviar el contenido');
assert(stab.includes('normalizeYoutubePromoDesign'),'El snapshot debe incluir diseño normalizado');
assert(out.includes('promo.design'),'Output debe aplicar el diseño incluido en el snapshot');
```

Crear `check-v2lab-emission-layout.js` que compruebe:

```js
assert(ui.includes("data-tab='output'") || ui.includes('data-tab="output"'));
assert(ui.includes('ecOutputSummaryHost'));
assert(ui.includes('ecNetworkPermissionsHost'));
assert(ui.includes('ecLanOutputHost'));
assert(ui.includes('ecNdiOutputHost'));
assert(ui.includes('ecDesignBackgroundsCard'));
assert(ui.includes('ecYoutubePromoPreview'));
assert(css.includes('@media(max-width:1180px)'));
assert(!css.includes('position:sticky'));
assert(ui.includes('safeResetDesign'));
```

- [ ] **Step 2: Integrar la nueva prueba en `npm run check`**

Agregar `node scripts/check-v2lab-emission-layout.js` al script `check` y el archivo a `build.files`.

- [ ] **Step 3: Ejecutar CI y confirmar RED**

Esperado: GitHub Actions falla específicamente porque aún no existen los nuevos hosts/layout/snapshot visual.

- [ ] **Step 4: Commit RED**

Commit: `test: cover emission layout and fresh youtube promo`

---

### Task 2: Normalizador puro de diseño Promo YouTube + snapshot fresco al emitir

**Files:**
- Create: `src/services/youtubePromoDesignLab29.js`
- Modify: `src/services/releaseV2Stabilization.js`
- Modify: `scripts/check-v2lab-youtube-promo.js`

**Interfaces:**
- Produces: `DEFAULT_YOUTUBE_PROMO_DESIGN`, `normalizeYoutubePromoDesign(raw, format)`, `normalizeYoutubePromoDesignRoot(raw)`.
- `releaseV2Stabilization.js` produce `freshYoutubePromoSnapshot(engine, payload)`.

- [ ] **Step 1: Añadir test unitario RED del normalizador**

Probar defaults 16:9/9:16, clamps y compatibilidad con `youtubePromoCtaText` heredado.

- [ ] **Step 2: Ejecutar test y verificar FAIL por módulo inexistente**

- [ ] **Step 3: Crear `youtubePromoDesignLab29.js`**

Defaults:

```js
{
  ctaText:'Puedes ver el video aquí:',
  formats:{
    '16:9':{position:'bottom-left',xPercent:4,yPercent:5,scale:1,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,titleMaxLines:2},
    '9:16':{position:'bottom-left',xPercent:5,yPercent:8,scale:.9,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,titleMaxLines:2}
  }
}
```

Clamps: x/y 0–40, scale .55–1.5, fuentes 10–72, opacity .35–1, thumbnail .6–1.6, radius 0–40, title lines 1–4.

- [ ] **Step 4: Implementar resolución fresca en `installActualYoutubeSnapshot()`**

En el wrapper de `sendAutomaticOutput`, para `mediaRole==='content'`:

1. leer settings actuales con `this.getSettings()`;
2. localizar el archivo actual en `this.canned.list(settings.canned.folder).files` por `path`;
3. usar el `youtubePromo` recién decorado de esa fila;
4. normalizar diseño por `settings.visual.output.format`;
5. añadir `ctaText` y `design` al snapshot;
6. si Promo fue desactivada después de reservar, enviar `youtubePromo:null`;
7. anuncios siempre `null`.

- [ ] **Step 5: Ejecutar tests y confirmar GREEN**

- [ ] **Step 6: Commit**

Commit: `fix: resolve youtube promo at playback time`

---

### Task 3: Aplicar diseño configurable en Output real

**Files:**
- Modify: `src/output-youtube-promo.js`
- Modify: `src/output-youtube-promo.css`
- Modify: `scripts/check-v2lab-youtube-promo.js`

**Interfaces:**
- Consumes: `youtubePromo.design` del payload.
- Produces: CSS vars `--yt-x`, `--yt-y`, `--yt-scale`, `--yt-cta-size`, `--yt-title-size`, `--yt-channel-size`, `--yt-bg-opacity`, `--yt-thumb-scale`, `--yt-radius`, `--yt-title-lines`; `data-position`.

- [ ] **Step 1: Añadir RED que compruebe uso de `promo.design` y variables CSS**

- [ ] **Step 2: Ejecutar y confirmar FAIL**

- [ ] **Step 3: Implementar `applyDesign()` en `output-youtube-promo.js`**

Aplicar vars al armar snapshot y restablecer defaults al limpiar/cambiar contenido.

- [ ] **Step 4: Reescribir CSS de posición/tamaño para consumir vars**

Mantener fade-in e instant-clear existentes; no introducir layout fijo que rompa 9:16.

- [ ] **Step 5: Ejecutar tests y confirmar GREEN**

- [ ] **Step 6: Commit**

Commit: `feat: style youtube promo from profile design`

---

### Task 4: Reorganizar Diseño de emisión y crear pestaña Salida

**Files:**
- Modify: `src/renderer-stabilization-lab28.js`
- Modify: `src/control-stabilization-lab28.css`
- Modify: `scripts/check-v2lab-emission-layout.js`

**Interfaces:**
- Produces DOM estable:
  - `#ecDesignLeft`
  - `#ecDesignRight`
  - `#tab-output`
  - `#ecOutputSummaryHost`
  - `#ecNetworkPermissionsHost`
  - `#ecLanOutputHost`
  - `#ecNdiOutputHost`

- [ ] **Step 1: Añadir RED para orden/hosts/movimiento de nodos existentes**

- [ ] **Step 2: Ejecutar y confirmar FAIL**

- [ ] **Step 3: Implementar `ensureEmissionLayout()` idempotente**

Columna izquierda: Formato y estilo → Tipografías → Promo YouTube.

Columna derecha: Preview → Transiciones → Fondos y casillas → Video de espera.

Mover `Fondos y casillas` conservando todos sus hijos/IDs/listeners. Mover `#ec0331StandbyCard` debajo del bloque de fondos.

- [ ] **Step 4: Implementar `ensureOutputTab()`**

Crear nav `Salida` entre Diseño de emisión y Audio y locución. Crear resumen de Output maestro y mover los paneles actuales mediante los IDs internos existentes.

- [ ] **Step 5: Implementar actualización de resumen**

Consumir `outputStatus()`, `outputLanStatus()`, `outputNdiStatus()` y eventos `output:state`, `output:lanState`, `output:ndiState`. El botón del resumen delega en `#openOutput`.

- [ ] **Step 6: Implementar CSS responsive**

Dos columnas por encima de 1180 px; una columna a 1180 px o menos. Sin `position:sticky`. Todos los hijos con `min-width:0`, textos/rutas con overflow seguro y acciones con wrap.

- [ ] **Step 7: Ejecutar test y confirmar GREEN**

- [ ] **Step 8: Commit**

Commit: `feat: split emission design and output routing`

---

### Task 5: Ampliar editor y preview de Promo YouTube

**Files:**
- Modify: `src/renderer-stabilization-lab28.js`
- Modify: `src/control-stabilization-lab28.css`
- Modify: `scripts/check-v2lab-emission-layout.js`

**Interfaces:**
- Consumes/guarda: `settings.visual.output.youtubePromoDesign`.
- Produce controles por formato y preview `#ecYoutubePromoPreview` sin reemplazar `#designPreview`.

- [ ] **Step 1: Añadir RED para controles completos y selector `Nota | Promo YouTube`**

- [ ] **Step 2: Ejecutar y confirmar FAIL**

- [ ] **Step 3: Expandir tarjeta Promo**

Controles: posición, escala, X, Y, CTA size, title size, channel size, CTA text, opacity, thumbnail scale, radius, max lines.

- [ ] **Step 4: Persistir de forma parcial**

Guardar únicamente `visual.output.youtubePromoDesign` fusionado con settings actuales. Mantener compatibilidad con `youtubePromoCtaText` heredado.

- [ ] **Step 5: Añadir selector de preview y capa Promo**

No reemplazar `#designPreview`; alternar visualmente Nota/Promo. Al interactuar con Promo, seleccionar Promo automáticamente. Al interactuar con Tipografías/Fondos, volver a Nota.

- [ ] **Step 6: Cambio de perfil**

Recargar `youtubePromoDesign` en `profile:changed` y nunca arrastrar valores de otro perfil.

- [ ] **Step 7: Ejecutar tests y confirmar GREEN**

- [ ] **Step 8: Commit**

Commit: `feat: add youtube promo design editor and preview`

---

### Task 6: Hacer Restaurar diseño no destructivo

**Files:**
- Modify: `src/renderer-stabilization-lab28.js`
- Modify: `scripts/check-v2lab-emission-layout.js`

**Interfaces:**
- Produces: `safeResetDesign()` que restablece solo claves visuales.

- [ ] **Step 1: Añadir RED que exija preservar `standbyVideo`, `standbyVideoUrl`, `verticalVideoBackground`, `verticalVideoBackgroundUrl`, `musicFile`, `musicUrl` y propiedades desconocidas**

- [ ] **Step 2: Ejecutar y confirmar FAIL**

- [ ] **Step 3: Implementar reset por allowlist visual**

Restablecer formato, animación, tipografías, colores, radios, opacidades, safe zones y `youtubePromoDesign`; preservar rutas/archivos y campos no reconocidos.

- [ ] **Step 4: Ejecutar test y confirmar GREEN**

- [ ] **Step 5: Commit**

Commit: `fix: keep nonvisual settings when resetting design`

---

### Task 7: Auditoría responsive y regresión completa

**Files:**
- Modify: `scripts/check-v2lab-emission-layout.js`
- Modify: `scripts/check-v2lab-stabilization-lab28.js` si hace falta ajustar asserts antiguos de ubicación.
- Modify: `package.json` solo si falta incluir nuevos módulos en `node --check` / build.

**Interfaces:**
- Consumes: todos los cambios anteriores.
- Produces: suite verde y build empaquetado.

- [ ] **Step 1: Añadir asserts de responsive**

Comprobar `minmax(0,1fr)`, `min-width:0`, media query 1180, ausencia de sticky y que los nodos no se recrean en resize.

- [ ] **Step 2: Ajustar regresiones antiguas que esperaban LAN/NDI dentro de Diseño**

Cambiar solo expectations de ubicación, no relajar funcionalidad.

- [ ] **Step 3: Ejecutar `npm run check` en GitHub Actions**

Esperado: todas las suites verdes.

- [ ] **Step 4: Ejecutar build portable y packaged smokes**

Esperado: artefacto `.exe` generado y todos los jobs verdes.

- [ ] **Step 5: Verificar manualmente por inspección/CI los tamaños objetivo**

1500×940, 1366×768, 1250×800, 1200×800, 1181×800, 1180×800, 1179×800 y 1100×720; cruzar breakpoint ida/vuelta.

- [ ] **Step 6: Commit final solo si hubo ajustes de integración**

Commit: `test: harden emission layout regressions`
