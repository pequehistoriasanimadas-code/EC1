# Emission Design Editor V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el nuevo UX de Diseño de emisión con Nota/Promo independientes por formato, Promo geométrica segura, visibilidad de metadata y fuentes base siempre utilizables.

**Architecture:** Añadir una capa Lab.29 focalizada y posterior a las estabilizaciones existentes. Un servicio puro normaliza/migra `noteDesign` y `youtubePromoDesign`; `SettingsStore.load()` materializa el Note Design del formato activo sobre los campos legacy para conservar compatibilidad con Output. Un renderer nuevo reemplaza visualmente el editor de Diseño sin recrear el Output, y un parche de Output aplica visibilidad y la geometría Promo normalizada sobre la señal maestra.

**Tech Stack:** Electron 43, JavaScript CommonJS, DOM/CSS, tests Node `assert`, GitHub Actions Windows portable.

**Spec:** `docs/superpowers/specs/2026-09-12-emission-design-editor-v2.md`

## Global Constraints

- Rama: `lab29-youtube-monitor-persistence`; no modificar `main`.
- Conservar Lab.29 primera reproducción de Promo y exclusión de anuncios.
- No crear una segunda composición para LAN/NDI.
- No reconstruir DOM durante resize; responsive por CSS.
- Fuentes base disponibles sin imports.
- Nota y Promo independientes entre 16:9 y 9:16.
- TikTok Safe restringe físicamente Promo 9:16.
- Resets contextuales preservan campos operativos.

---

### Task 1: Regression gate y modelo de datos

**Files:**
- Create: `scripts/check-v2lab-emission-design-v2.js`
- Modify: `scripts/check-v2lab-stabilization-lab28.js`
- Create: `src/services/emissionDesignLab29.js`

**Interfaces:**
- Produces: `normalizeNoteDesignRoot(raw, legacyOutput)`, `effectiveNoteDesign(output, format)`, `normalizePromoDesignRoot(raw, options)`, `normalizePromoFormat(raw, format, options)`, `materializeEffectiveOutput(output)`, `promoSafeRect(format, tiktokSafe)`, `promoPreset(name, format, geometry, tiktokSafe)`.

- [ ] **Step 1: Write the failing test**
  - Test legacy Note migration to both formats.
  - Test format independence.
  - Test visibility defaults and exclusive visual-only field.
  - Test six Promo presets plus custom coordinates.
  - Test safe-zone clamping.
  - Test legacy Promo migration from `scale/titleMaxLines`.
  - Test long/wide geometry remains within allowed rect.
  - Test materialization overlays only active Note format onto legacy flat output.

- [ ] **Step 2: Run test to verify it fails**
  - Run via CI after wiring `require('./check-v2lab-emission-design-v2')` into stabilization gate.
  - Expected: FAIL because `src/services/emissionDesignLab29.js` does not exist.

- [ ] **Step 3: Write minimal implementation**
  - Implement pure normalizers and clamping only.

- [ ] **Step 4: Run tests and verify green**
  - New gate plus current stabilization gate.

- [ ] **Step 5: Commit**
  - `feat: add format-aware emission design model`

### Task 2: Persistencia y compatibilidad SettingsStore

**Files:**
- Create: `src/services/releaseV2EmissionDesign.js`
- Modify: `src/bootstrap-v2lab.js`
- Test: `scripts/check-v2lab-emission-design-v2.js`

**Interfaces:**
- Consumes model functions from Task 1.
- Produces `installReleaseV2EmissionDesign()` and normalized settings at every load/save boundary.

- [ ] **Step 1: Write failing persistence tests**
  - Old profile receives `noteDesign` without losing legacy values.
  - Active format gets materialized on load.
  - Saving format 9:16 leaves 16:9 unchanged.
  - Operational fields survive migration.

- [ ] **Step 2: Verify RED**
  - Expected missing release module/bootstrap installation.

- [ ] **Step 3: Implement SettingsStore wrapper and injection shell**
  - Wrap `defaults/load/save` idempotently.
  - Install after Lab.29 in bootstrap.
  - Inject control/output assets after existing stabilization assets.

- [ ] **Step 4: Verify GREEN**
  - New model/persistence tests pass.

- [ ] **Step 5: Commit**
  - `feat: persist emission designs per format`

### Task 3: Nuevo editor de Diseño de emisión

**Files:**
- Create: `src/renderer-emission-design-v2.js`
- Create: `src/control-emission-design-v2.css`
- Test: `scripts/check-v2lab-emission-design-v2.js`

**Interfaces:**
- Reads/writes `settings.visual.output.noteDesign` and `youtubePromoDesign`.
- Reuses `#outputFormat`, `#designPreview`, transition card and standby card.

- [ ] **Step 1: Write failing structural assertions**
  - Global format block remains outside mode panels.
  - `Nota | Promo YouTube` controls settings and preview.
  - Fondos y casillas lives in Nota.
  - Transiciones + standby remain right column.
  - Category/Date/Exclusive checkboxes have labels without “Mostrar”.
  - Promo controls contain sliders + numeric companions for X/Y/width/minHeight.
  - Typography sizes remain numeric.
  - `Máximo de líneas` removed.

- [ ] **Step 2: Verify RED**
  - Expected missing renderer/CSS.

- [ ] **Step 3: Implement editor**
  - Initialize base fonts synchronously and keep selects enabled.
  - Preserve custom font loading/deletion behavior.
  - Mode switch toggles stable wrappers/classes, not DOM reconstruction.
  - Format switch commits current draft then hydrates target format.
  - Visibility toggles disable subordinate controls without clearing values.
  - Contextual reset buttons.
  - Promo preset buttons + sliders/numbers + advanced controls.
  - Debounce persistence; preview updates immediately.

- [ ] **Step 4: Verify GREEN**
  - Static gate and renderer syntax pass.

- [ ] **Step 5: Commit**
  - `feat: redesign emission note and promo editor`

### Task 4: Output Note visibility y Promo geometry

**Files:**
- Create: `src/output-emission-design-v2.js`
- Create: `src/output-emission-design-v2.css`
- Modify: `src/services/youtubePromoDesignLab29.js`
- Test: `scripts/check-v2lab-emission-design-v2.js`

**Interfaces:**
- Promo snapshot keeps using `normalizeYoutubePromoDesign()` from existing service, now backed by V2 model.
- Output patch consumes already-normalized effective design and visibility.

- [ ] **Step 1: Write failing output assertions**
  - Six presets supported.
  - Width/minHeight replace scale as effective geometry.
  - No user-facing title line count.
  - Safe zone 9:16 limits card.
  - Category/date/exclusive visibility is visual only.
  - Ads remain promo-null through existing stabilization gate.

- [ ] **Step 2: Verify RED**
  - Existing Promo service still exposes old four positions/scale/titleMaxLines.

- [ ] **Step 3: Implement output patch and service compatibility**
  - Keep accepting legacy `scale/titleMaxLines` inputs for migration.
  - Emit new geometry fields in playback snapshot.
  - Apply centered geometry with CSS vars, natural title wrapping and overflow safety.
  - Apply Note visibility to live story and transition snapshots.

- [ ] **Step 4: Verify GREEN**
  - New gate, YouTube promo gate and stabilization gate pass.

- [ ] **Step 5: Commit**
  - `feat: apply safe promo geometry to output`

### Task 5: Regression hardening y build

**Files:**
- Modify tests only if verification reveals missing coverage; no speculative production changes.

- [ ] **Step 1: Run static diagnostics**
  - `npm run check` in GitHub Actions.

- [ ] **Step 2: Inspect any failure by root cause**
  - Do not patch tests merely to match implementation.

- [ ] **Step 3: Run full Windows portable workflow**
  - Require packaged responsive/UI smoke and portable build success.

- [ ] **Step 4: Review PR diff against spec**
  - Confirm no accidental changes to Audio, scheduler, TTS, LAN/NDI or YouTube linkage.

- [ ] **Step 5: Produce test artifact**
  - Only after green CI, surface the Windows EXE for manual acceptance.

## Self-review

Spec coverage: global format, two independent Note formats, two independent Promo formats, visibility checkboxes, font regression, six presets, safe-zone clamping, slider/number UX, advanced controls, contextual reset, right-column shared controls, responsive stability, profile migration and Output consistency are all mapped to tasks.

No placeholders remain; all production changes require a failing gate first.
