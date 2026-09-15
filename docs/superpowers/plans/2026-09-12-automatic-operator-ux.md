# Automático Operator UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `Automático` into a broadcast operator console while preserving all existing queue, preparation, emission, content, YouTube, monitor, profile, LAN/NDI and exclusive-scheduling behavior.

**Architecture:** Add one focused Lab.29 renderer module that installs an idempotent DOM layout around existing controls and one focused CSS file for layout/icons. Existing controls are moved, never cloned, so their established listeners and persistence paths remain owners. `renderer-0332` continues to own queue rendering and `renderer-lab29` continues to own monitor capture and YouTube persistence.

**Tech Stack:** Electron renderer, vanilla JavaScript DOM, CSS Grid, existing ECAPI bridge, Node static regression scripts, GitHub Actions Windows build.

**Spec:** `docs/superpowers/specs/2026-09-12-automatic-operator-ux.md`

## Global Constraints
- Work only on `lab29-youtube-monitor-persistence`; do not modify `main`.
- Do not create a second queue renderer, monitor capture loop, Content save path, or YouTube Promo save path.
- Do not add decorative icons/thumbnails inside `.queue-item` cards.
- Move existing switch/button nodes so existing listeners survive.
- Responsive changes must be CSS-only; no resize-time DOM reparenting.
- Preserve minimum control-window behavior at 1100×720.

---

### Task 1: RED regression contract

**Files:**
- Create: `scripts/check-v2lab-auto-ux-lab29.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: current renderer/CSS source files.
- Produces: a required gate for the new UX architecture.

- [ ] **Step 1: Write the failing test**

The test must require production files that do not exist yet and assert:
- focused renderer/CSS exist;
- Lab.29 loads the new renderer;
- exactly one Content/Promo switch is used by moving original rows;
- preparation buttons are moved into queue-header host, not cloned;
- queue is not rendered/replaced by the UX module;
- queue cards do not receive decorative icon markup;
- no separate `Próximo contenido` card or `PRÓXIMO` queue badge is created;
- right column owns monitor, on-air, emission control, and session counters;
- CSS has two-column wide layout and CSS-only <=1180 stacking;
- nav/operator icons exist and `Abrir Output` uses monitor styling.

- [ ] **Step 2: Add the test to `npm run check`**

Append `node scripts/check-v2lab-auto-ux-lab29.js` after the existing Lab.29 checks.

- [ ] **Step 3: Run CI and verify RED**

Expected: static diagnostics fail because `src/renderer-auto-ux-lab29.js` / `src/control-auto-ux-lab29.css` are missing.

- [ ] **Step 4: Commit**

Commit test + package gate separately from implementation.

---

### Task 2: Operator layout installer

**Files:**
- Create: `src/renderer-auto-ux-lab29.js`
- Modify: `src/renderer-lab29.js`

**Interfaces:**
- Consumes existing DOM ids: `#tab-auto`, `.auto-cols`, `.queue-card`, `#ecLanMonitorCard`, `#processingState`, `#emissionState`, `#queueSummary`, `#sessionCounters`, `#cannedEnabled`, `#ecYoutubePromoEnabled`, `#processStart`, `#processPause`, `#processResume`, `#processStop`, `#emissionStart`, `#emissionPause`, `#emissionResume`, `#emissionStop`, `#exclusiveSchedule0324`, `#outputStatus`.
- Produces stable hosts: `#ecAutoOperatorStrip`, `#ecAutoLeft`, `#ecAutoRight`, `#ecAutoQueueActions`, `#ecAutoPrepSettingsHost`, `#ecAutoExclusiveHost`, `#ecAutoNowHost`, `#ecAutoEmissionHost`, `#ecAutoSessionHost`.

- [ ] **Step 1: Implement idempotent prerequisites**

Wait until queue, monitor, content switch, promo switch, session counters and exclusive card exist. Bail/retry without duplicating anything.

- [ ] **Step 2: Build stable wrappers**

Create the top operator strip and left/right hosts once. Reuse existing `.auto-cols` as the main grid.

- [ ] **Step 3: Move original controls**

Move, do not clone:
- `#processingState`, `#emissionState`, `#outputStatus` into operator strip status items;
- switch rows owning `#cannedEnabled` and `#ecYoutubePromoEnabled` into operator strip;
- `.queue-card` into left column;
- preparation control `.buttons` into `#ecAutoQueueActions`;
- compact preparation settings card below queue;
- `#exclusiveSchedule0324` below queue;
- `#ecLanMonitorCard` into right column;
- existing emission card into right emission host;
- `#sessionCounters` into right session host.

- [ ] **Step 4: Create `Ahora al aire` presentation**

Add one presentational card that reads `automationState.emission` and current output state only. It must not issue commands or own playback state. Subscribe to `automation:state` / `output:state` and render title/kind/progress/state from those snapshots.

- [ ] **Step 5: Keep detailed settings in their original modules**

The moved Promo switch leaves lead/API/refresh/link management in `Contenidos / Anuncios`. The moved Content switch leaves folder, emergency, interval, recovery and libraries there.

- [ ] **Step 6: Load module from Lab.29 renderer**

Add a one-shot script loader in `renderer-lab29.js`; do not add another control bootstrap or timer beyond the module's prerequisite retry/idempotent refresh.

- [ ] **Step 7: Run focused gate and syntax check**

Expected: focused gate moves from missing-file failure to behavioral/source-contract success.

---

### Task 3: Visual hierarchy and icon system

**Files:**
- Create: `src/control-auto-ux-lab29.css`
- Modify: `src/renderer-auto-ux-lab29.js`

**Interfaces:**
- Consumes stable hosts/classes from Task 2.
- Produces CSS-only responsive operator console and line-icon decoration.

- [ ] **Step 1: Add CSS loader once**

The UX renderer appends one `<link id="ecAutoUxLab29Css">` for `control-auto-ux-lab29.css`.

- [ ] **Step 2: Wide operator layout**

Queue/left column receives the larger share; right column is monitor/current/control/session. Bottom prep/exclusive area is compact.

- [ ] **Step 3: Queue preservation**

Style existing `.queue-item` rows but do not add icon pseudo-elements to `.queue-item`, `.queue-type`, or per-row type. Keep color accent, badges, title, metadata and technical details.

- [ ] **Step 4: Icon system**

Use CSS mask data URIs/pseudo-elements for sidebar navigation and operator-level headings/actions. `#openOutput::before` uses a monitor icon. Icon decoration must not replace visible labels.

- [ ] **Step 5: Responsive CSS only**

At <=1180 px stack columns. No `resize` listener, no resize-driven `appendChild`, no sticky preview behavior.

- [ ] **Step 6: Run focused source gate**

Expected: PASS.

---

### Task 4: State synchronization and regression hardening

**Files:**
- Modify: `src/renderer-auto-ux-lab29.js`
- Modify: `scripts/check-v2lab-auto-ux-lab29.js`

**Interfaces:**
- Consumes `automation:state`, `output:state`, `profile:changed`.
- Produces synchronized operator-strip summaries without new persistence authority.

- [ ] **Step 1: Add state rendering assertions**

Test source contract for `profile:changed`, content/promo original nodes, no `saveSettings` calls in the UX module, and no queue renderer override.

- [ ] **Step 2: Implement summary-only refresh**

Update prepared count/target/autonomy from `automationState`; do not modify backend settings.

- [ ] **Step 3: Handle profile change idempotently**

Re-run installer/hydration after profile change, ensuring moved nodes remain singular and current values are those hydrated by existing owners.

- [ ] **Step 4: Verify no duplicate ids/authorities**

Gate checks source for forbidden duplicate input creation and forbidden `renderQueue=` / `outputMonitorFrame` loop ownership.

---

### Task 5: Full regression verification

**Files:**
- No production change unless a failing regression identifies a root cause.

- [ ] **Step 1: Run static diagnostics**

Run the repository `npm run check` workflow. Fix only root-caused failures; rerun until green.

- [ ] **Step 2: Run Windows Portable workflow**

Require build, startup, NDI, network permissions, pipeline, responsive, output, 0.3.x compatibility and artifact upload all green.

- [ ] **Step 3: Inspect failures recursively**

If a fix creates another failure, diagnose the new root cause, add/adjust a regression test, make the minimal fix, and repeat until the workflows are green.

- [ ] **Step 4: Manual acceptance matrix**

Verify on Windows when user tests:
- Content switch moved and still persists.
- Promo switch moved and still persists per profile.
- Queue has full metadata and no decorative row icons.
- preparation buttons in queue header still operate.
- manual content remains represented by queue order/status only.
- monitor adaptive capture remains alive.
- emission controls and session counters update.
- exclusive rule unchanged.
- resize sequence 1500→1300→1181→1180→1100→1180→1500 preserves one instance of every moved control.
