# Lab29 Settings UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar Ajustes en dos columnas sin cambiar su lógica: Optimización y Fuentes se conservan, IA local queda primero a la derecha, y la UI editorial legacy deja de mostrarse.

**Architecture:** Una capa UX Lab29 tardía crea wrappers de presentación y mueve nodos DOM existentes; no clona inputs ni listeners. Los contenedores legacy se ocultan solo después de mover los controles. Responsive únicamente por CSS.

**Tech Stack:** Electron 43, JavaScript DOM, CSS Grid/Flex, Node.js regression checks, GitHub Actions Windows.

**Spec:** `docs/superpowers/specs/2026-09-12-settings-ux-lab29.md`

## Global Constraints

- No modificar ni fusionar `main`.
- No mover ni estilizar `#ecOptimizer0321`.
- No reconstruir `.feedrow`.
- Conservar `#globalPartialClose`, `#globalExclusiveClose` y `#queueColorExclusive`.
- Ocultar, no destruir, `#editorialPrompt` y `#editorialInstructions`.
- Mantener IDs/listeners actuales y compatibilidad de perfiles.
- No reparentar por `resize`.
- Mantener dos columnas a 1100 px; colapso solo por debajo de 980 px.

---

### Task 1: Test RED de Settings UX

**Files:**
- Create: `scripts/check-v2lab-settings-ux-lab29.js`
- Modify: `package.json`

**Interfaces:** El check consume los nuevos assets y falla hasta que existan.

- [ ] **Step 1: Escribir el check estático**

Debe leer `src/renderer-settings-ux-lab29.js`, `src/control-settings-ux-lab29.css`, `src/services/releaseV2UxRepairLab29.js` y `package.json`, y verificar literalmente:

```js
assert.doesNotThrow(()=>new Function(renderer));
assert(renderer.includes('ec29SettingsWorkspace'));
assert(renderer.includes('ec29SettingsLeft')&&renderer.includes('ec29SettingsRight'));
assert(renderer.includes("q('#feeds')")&&renderer.includes("q('#addFeed')"));
assert(renderer.includes("q('#globalPartialClose')")&&renderer.includes("q('#globalExclusiveClose')"));
assert(!renderer.includes("querySelectorAll('.feedrow')"));
assert(renderer.includes("q('#queueColorExclusive')"));
assert(renderer.includes('syncLocalBackupPolicy'));
assert(renderer.includes("backups.includes('local')")&&renderer.includes("primary!=='local'"));
assert(renderer.includes('ec29LegacyEditorialHidden'));
assert(renderer.indexOf("right.appendChild(localCard)")<renderer.indexOf("right.appendChild(serviceCard)"));
assert(renderer.indexOf("right.appendChild(serviceCard)")<renderer.indexOf("right.appendChild(providersCard)"));
assert(css.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));
assert(css.includes('#ec29SettingsServiceGrid')&&css.includes('repeat(3'));
assert(css.includes('#ec29SettingsProvidersGrid')&&css.includes('repeat(2'));
assert(css.includes('#ec29SettingsQueueCard .queue-colors')&&css.includes('repeat(6'));
assert(css.includes('@media(max-width:980px)'));
assert(!/addEventListener\(['"]resize['"][\s\S]{0,500}(appendChild|insertAdjacentElement|replaceChildren)/.test(renderer));
assert(release.includes("control-settings-ux-lab29.css")&&release.includes("renderer-settings-ux-lab29.js"));
assert(pkg.scripts.check.includes('check-v2lab-settings-ux-lab29.js'));
```

- [ ] **Step 2: Añadir `node scripts/check-v2lab-settings-ux-lab29.js` a `npm run check`.**
- [ ] **Step 3: Abrir PR de la rama aislada a `main` y comprobar que CI falla por los assets todavía inexistentes.**

---

### Task 2: Renderer aditivo de Ajustes

**Files:**
- Create: `src/renderer-settings-ux-lab29.js`
- Modify: `src/services/releaseV2UxRepairLab29.js`

**Interfaces:** Consume los IDs actuales; produce `#ec29SettingsWorkspace`, `#ec29SettingsLeft`, `#ec29SettingsRight` y tarjetas de presentación.

- [ ] **Step 1: Esperar con retry acotado** a `#tab-settings`, `#ecOptimizer0321`, `#feeds`, `#addFeed`, `#globalPartialClose`, `#globalExclusiveClose`, `#pickFallback`, `#primary`, `#backup1`, `#backup2`, `#localInfo`, `#localBackupMode`, `#queueColorExclusive` y `#tab-audio`.
- [ ] **Step 2: Crear workspace** inmediatamente después de `#ecOptimizer0321`:

```html
<div id="ec29SettingsWorkspace" class="ec29-settings-workspace">
  <div id="ec29SettingsLeft" class="ec29-settings-stack"></div>
  <div id="ec29SettingsRight" class="ec29-settings-stack"></div>
</div>
```

- [ ] **Step 3: Fuentes.** Mover al nuevo card, sin reconstruirlos: `#feedCount.closest('.section-head')`, la nota original, `#feeds`, `#addFeed`, `#globalPartialClose`, `#globalExclusiveClose`.
- [ ] **Step 4: Imagen de respaldo.** Crear card con título/nota y mover `#pickFallback` + `#fallbackInfo`.
- [ ] **Step 5: Apariencia.** Mover `.queue-colors` + botones de `#resetQueueColors`, ordenar inputs como RSS, Generated, Exclusive, Content, Ad, Error; cambiar solo el label visible “Notas generadas” a “Notas”.
- [ ] **Step 6: IA local primero.** Mover `#localInfo`, diagnóstico si existe, `#downloadModel`, `#downloadProgress`, política de backup, `#localPolicyInfo`. Colocar `#startLocal` y `#stopLocal` dentro de `<details>` “Controles avanzados”.
- [ ] **Step 7: Política backup condicional.** Implementar:

```js
function syncLocalBackupPolicy(){
  const primary=q('#primary')?.value||'';
  const backups=[q('#backup1')?.value,q('#backup2')?.value];
  const asBackup=primary!=='local'&&backups.includes('local');
  q('#ec29LocalBackupPolicy')?.classList.toggle('hidden',!asBackup);
}
```

Y sincronizar tras cambios de provider/localBackupMode y `profile:changed`.
- [ ] **Step 8: Servicio IA.** Mover `#providerSummary` y los labels de `#primary/#backup1/#backup2` a `#ec29SettingsServiceGrid`.
- [ ] **Step 9: Proveedores.** Claude y Gemini en dos subcards, moviendo sus status, labels/API/model y botones originales.
- [ ] **Step 10: Editorial legacy.** Añadir `ec29LegacyEditorialHidden` a los bloques que contienen `#editorialInstructions` y `#editorialPrompt`; mantener IDs en DOM.
- [ ] **Step 11: Ocultar los dos cards legacy** con `ec29-settings-legacy-host` solo al final.
- [ ] **Step 12: Inyección.** Añadir a `releaseV2UxRepairLab29.js`:

```js
injectFile(win,'control-settings-ux-lab29.css','css');
injectFile(win,'renderer-settings-ux-lab29.js','js');
```

---

### Task 3: CSS compacto sin tocar Fuentes

**Files:**
- Create: `src/control-settings-ux-lab29.css`

- [ ] **Step 1: Dos columnas 50/50** con `#ec29SettingsWorkspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}`.
- [ ] **Step 2: Stacks** con flex column y gap 14px.
- [ ] **Step 3: Servicio** con `repeat(3,minmax(0,1fr))`.
- [ ] **Step 4: Proveedores** con `repeat(2,minmax(0,1fr))`.
- [ ] **Step 5: Cola** con `repeat(6,minmax(0,1fr))`, labels compactos y botón Restaurar alineado al final.
- [ ] **Step 6: Ocultar legacy** con `.ec29-settings-legacy-host,.ec29LegacyEditorialHidden{display:none!important}` restringido a `#tab-settings`.
- [ ] **Step 7: Responsive solo a 980 px:** workspace/servicio/proveedores pasan a una columna; colores a tres columnas.
- [ ] **Step 8: No añadir selectores `.feedrow`, `.feed-head`, `.feed-edit` ni `.feed-list-scroll` al nuevo CSS.**

---

### Task 4: GREEN y auditoría

**Files:** Test `scripts/check-v2lab-settings-ux-lab29.js`; suite existente `npm run check`.

- [ ] **Step 1: Ejecutar check dedicado.** Esperado: `check-v2lab-settings-ux-lab29: OK`.
- [ ] **Step 2: Ejecutar `npm run check`.** Esperado: exit 0.
- [ ] **Step 3: Auditar:** `addFeed` sigue dentro de `.card`; ambos cierres siguen en Fuentes; `queueColorExclusive` sigue en `.queue-colors`; editorial prompt/instructions siguen en DOM; IDs de IA/provider no cambian; no hay MutationObserver global nuevo; no hay reparenting por resize.

---

### Task 5: CI y Portable

- [ ] **Step 1:** confirmar Lab29 static diagnostics verde en el SHA final.
- [ ] **Step 2:** confirmar Windows Portable verde en el mismo SHA; si falla, usar systematic-debugging y corregir antes de continuar.
- [ ] **Step 3:** verificar que el artifact corresponde al SHA final probado.
- [ ] **Step 4:** dejar la rama lista; no hacer merge a `main`.
