# GEC V2.0 TTS Lab.29 — Diseño de emisión, Salida y Promo YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar Diseño de emisión y crear Salida sin perder funciones, ampliar el diseño de Promo YouTube, corregir su primera reproducción y conservar la estabilidad responsive existente.

**Architecture:** Mantener la lógica existente y mover/reusar nodos con IDs y listeners actuales mediante hosts estables. El layout responsive se resolverá únicamente con CSS Grid/media queries. La Promo YouTube se normalizará por perfil/formato y se resolverá de nuevo al comenzar la reproducción para evitar snapshots obsoletos.

**Tech Stack:** Electron 43, Node.js, JavaScript vanilla, HTML/CSS, GitHub Actions, scripts de regresión Node existentes.

**Spec:** `docs/superpowers/specs/2026-09-11-emission-output-youtube-layout-design.md`

## Global Constraints

- Rama objetivo: `lab29-youtube-monitor-persistence`.
- Mantener `Audio y locución` sin duplicar controles de sonido.
- Mantener el WYSIWYG `#designPreview` y su `ResizeObserver`.
- No reconstruir DOM en `window.resize`.
- No añadir preview sticky.
- Mantener compatibilidad con perfiles antiguos.
- API Key YouTube sigue siendo global de máquina y no viaja en perfiles.
- Anuncios nunca reciben `youtubePromo`.
- `Restaurar diseño` no puede borrar standby, archivos, links, metadata, LAN/NDI ni campos futuros no visuales.
- Layout válido desde 1100x720 hasta 1500x940 y cruzando repetidamente el breakpoint 1180 px.

---

### Task 1: Regression tests for stale YouTube promo snapshots

**Files:**
- Modify: `scripts/check-v2lab-youtube-promo.js`
- Modify: `scripts/check-v2lab-lab29-youtube-monitor.js`
- Possibly modify: `package.json` only if a new check script is created.

**Interfaces:**
- Consumes: current `releaseV2YoutubePromo` decoration and `releaseV2Stabilization` playback hooks.
- Produces: failing checks for OFF→ON before first playback, ON→OFF before first playback, design refresh before playback, and ads without promo.

- [ ] **Step 1: Add a failing regression for OFF -> reserve -> ON -> first play**

Create a fixture where a canned content item is decorated/reserved while `youtubePromo.enabled=false`, then update the active profile settings to enabled before `playCanned`. Assert the outgoing automatic-output payload includes a non-null `youtubePromo` on that first playback.

- [ ] **Step 2: Run the YouTube checks and verify RED**

Run:

```bash
node scripts/check-v2lab-youtube-promo.js
node scripts/check-v2lab-lab29-youtube-monitor.js
```

Expected: at least the new stale-snapshot regression fails against the current implementation.

- [ ] **Step 3: Add complementary failing cases**

Add assertions for:

```text
reserved while ON -> disable before playback -> youtubePromo === null
reserved -> change youtubePromoDesign -> first playback uses new design values
ad item -> youtubePromo === null regardless of enabled state
```

- [ ] **Step 4: Re-run and record failures**

Expected: all newly added cases fail for the precise stale-state reason, not syntax/setup errors.

- [ ] **Step 5: Commit RED tests**

```bash
git add scripts/check-v2lab-youtube-promo.js scripts/check-v2lab-lab29-youtube-monitor.js package.json
git commit -m "test: cover live youtube promo resolution"
```

---

### Task 2: Normalize and persist YouTube promo design per profile and format

**Files:**
- Modify: `src/services/releaseV2Lab29.js`
- Modify: `src/services/releaseV2YoutubePromo.js`
- Modify: `src/renderer-stabilization-lab28.js`
- Modify: `src/renderer-lab29.js`
- Modify: `scripts/check-v2lab-youtube-promo.js`
- Modify: `scripts/check-v2lab-profile-compat.js`

**Interfaces:**
- Produces: normalized `visual.output.youtubePromoDesign` with `ctaText` and `formats['16:9'|'9:16']`.
- Produces helper semantics that preserve legacy `visual.output.youtubePromoCtaText` as a backward-compatible source on load.

- [ ] **Step 1: Add failing profile/default normalization checks**

Assert a legacy profile with no `youtubePromoDesign` produces these safe defaults:

```js
{
  ctaText: 'Puedes ver el video aquí:',
  formats: {
    '16:9': { position:'bottom-left', xPercent:4, yPercent:5, scale:1, ctaFontSize:22, titleFontSize:18, channelFontSize:14, backgroundOpacity:.85, thumbnailScale:1, borderRadius:14, titleMaxLines:2 },
    '9:16': { position:'bottom-left', xPercent:5, yPercent:8, scale:.9, ctaFontSize:22, titleFontSize:18, channelFontSize:14, backgroundOpacity:.85, thumbnailScale:1, borderRadius:14, titleMaxLines:2 }
  }
}
```

- [ ] **Step 2: Run profile/youtube checks and verify RED**

```bash
node scripts/check-v2lab-profile-compat.js
node scripts/check-v2lab-youtube-promo.js
```

- [ ] **Step 3: Implement a single normalization path**

Clamp numeric fields and allowed positions. If legacy `youtubePromoCtaText` exists and `youtubePromoDesign.ctaText` does not, migrate it in memory without deleting the legacy field during this release.

- [ ] **Step 4: Make Lab29 preservation logic merge promo design non-destructively**

The persistence guard must preserve `links`/`videos` and accept only the intended current `enabled`, `leadSeconds`, and visual design fields from the active profile.

- [ ] **Step 5: Re-run checks to GREEN**

```bash
node scripts/check-v2lab-profile-compat.js
node scripts/check-v2lab-youtube-promo.js
```

- [ ] **Step 6: Commit**

```bash
git add src/services/releaseV2Lab29.js src/services/releaseV2YoutubePromo.js src/renderer-stabilization-lab28.js src/renderer-lab29.js scripts/check-v2lab-youtube-promo.js scripts/check-v2lab-profile-compat.js
git commit -m "feat: persist youtube promo design per profile"
```

---

### Task 3: Resolve YouTube promo authoritatively at playback time

**Files:**
- Modify: `src/services/releaseV2YoutubePromo.js`
- Modify: `src/services/releaseV2Stabilization.js`
- Modify: `src/output-youtube-promo.js`
- Modify: `scripts/check-v2lab-youtube-promo.js`
- Modify: `scripts/check-v2lab-lab29-youtube-monitor.js`

**Interfaces:**
- Produces: one authoritative playback-time resolver that reads active profile/config immediately before sending output.
- Snapshot includes normalized design for the active output format.

- [ ] **Step 1: Identify the current two `playCanned` wrappers and choose one owner**

The final behavior must have exactly one authoritative place where `youtubePromo` is resolved for the outgoing payload. Other wrappers may delegate but must not cache or overwrite a fresh snapshot.

- [ ] **Step 2: Implement fresh resolution at `playCanned` start**

For content only:

```text
active profile -> current youtube config -> current content mapping/metadata -> current output format -> normalized youtubePromoDesign -> snapshot
```

Do not re-query YouTube if persisted metadata is already sufficient.

- [ ] **Step 3: Keep ads hard-null**

Ensure all ad output payloads force `youtubePromo:null`.

- [ ] **Step 4: Pass visual design in the snapshot**

The output renderer must receive the exact design values used for that playback so Preview/Output/Monitor/LAN/NDI do not derive different values.

- [ ] **Step 5: Run RED tests to GREEN**

```bash
node scripts/check-v2lab-youtube-promo.js
node scripts/check-v2lab-lab29-youtube-monitor.js
```

Expected: OFF→ON, ON→OFF, design change after reservation, repeated content, and ad cases pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/releaseV2YoutubePromo.js src/services/releaseV2Stabilization.js src/output-youtube-promo.js scripts/check-v2lab-youtube-promo.js scripts/check-v2lab-lab29-youtube-monitor.js
git commit -m "fix: resolve youtube promo at playback time"
```

---

### Task 4: Build stable Diseño de emisión and new Salida layout hosts

**Files:**
- Modify: `src/control.html`
- Modify: `src/renderer-0327.js`
- Modify: `src/renderer-0325.js`
- Modify: network/LAN/NDI renderer module that currently injects into `#tab-emission`
- Modify: standby renderer/service UI module that currently positions relative to Transiciones
- Modify: `src/control.css`
- Modify: `src/control-0325.css`
- Modify: `src/control-0327.css`
- Modify: `src/control-stabilization-lab28.css`
- Modify: `scripts/check-v2lab-responsive.js`
- Modify: `scripts/check-v2lab-network-permissions.js`
- Modify: `scripts/check-v2lab-lan-output.js`
- Modify: `scripts/check-v2lab-ndi.js`

**Interfaces:**
- Produces stable hosts:

```text
#ecDesignLeft
#ecDesignRight
#tab-output
#ecOutputSummaryHost
#ecNetworkPermissionsHost
#ecLanOutputHost
#ecNdiOutputHost
```

- [ ] **Step 1: Add failing structural checks**

Assert navigation order contains `Diseño de emisión -> Salida -> Audio y locución`, and assert the stable hosts exist exactly once.

- [ ] **Step 2: Add failing responsive invariants**

The check must cover at least 1500, 1366, 1250, 1200, 1181, 1180, 1179 and 1100 widths and assert:

```text
no global horizontal overflow
no card wider than main
no fixed-width Promo control forcing overflow
preview aspect ratio remains 16:9 or 9:16
```

- [ ] **Step 3: Create hosts without changing existing control IDs**

Keep the current `#designPreview`, transition controls, typography controls, network IDs, LAN IDs and NDI IDs intact. Hosts are new; functional controls are moved/reparented once.

- [ ] **Step 4: Move existing nodes once at initialization**

Final Design order:

```text
LEFT: Formato y estilo -> Tipografías por elemento -> Promo YouTube
RIGHT: Vista previa -> Transiciones -> Fondos y casillas -> Video de espera
```

Final Salida order:

```text
Output maestro -> Permisos de red -> Output LAN -> NDI
```

Do not reparent on resize.

- [ ] **Step 5: Add Output maestro status card as read-only status/control**

It may open/show Output but must not own duplicate LAN/NDI settings. It reads existing state/events.

- [ ] **Step 6: Preserve current responsive model**

Use `minmax(0,1fr)`, `min-width:0`, wrapped actions, and the existing 1180/850-ish breakpoints. At <=1180 the columns become one column naturally through CSS only.

- [ ] **Step 7: Run layout/network checks**

```bash
node scripts/check-v2lab-responsive.js
node scripts/check-v2lab-network-permissions.js
node scripts/check-v2lab-lan-output.js
node scripts/check-v2lab-ndi.js
```

- [ ] **Step 8: Commit**

```bash
git add src/control.html src/renderer-0327.js src/renderer-0325.js src/control.css src/control-0325.css src/control-0327.css src/control-stabilization-lab28.css scripts/check-v2lab-responsive.js scripts/check-v2lab-network-permissions.js scripts/check-v2lab-lan-output.js scripts/check-v2lab-ndi.js
git commit -m "feat: separate emission design from output routing"
```

---

### Task 5: Expand Promo YouTube editor and preview without replacing WYSIWYG

**Files:**
- Modify: `src/renderer-stabilization-lab28.js`
- Modify: `src/renderer-lab29.js`
- Modify: `src/output-youtube-promo.js`
- Modify: `src/control-stabilization-lab28.css`
- Modify: `src/control-0325.css`
- Modify: `scripts/check-v2lab-responsive.js`
- Modify: `scripts/check-v2lab-youtube-promo.js`

**Interfaces:**
- Adds preview mode `note|youtube` as UI-only state.
- Does not modify `settings.visual.output.format` when toggling preview mode.

- [ ] **Step 1: Add failing checks for editor controls and preview independence**

Assert the Promo editor exposes position, X, Y, scale, CTA/title/channel sizes, CTA text, background opacity, thumbnail scale, radius and title max lines. Assert toggling `Nota|Promo YouTube` does not alter output format.

- [ ] **Step 2: Expand the existing Promo card instead of creating a second card**

Use current CTA input as part of the full editor. Save partial `visual.output.youtubePromoDesign` only; do not call a whole-settings write with stale data.

- [ ] **Step 3: Add a second preview layer inside the existing preview host**

Do not replace `#designPreview`. Preserve its `ResizeObserver`. Add a sibling/layer for YouTube sample rendering and a compact selector in the preview card header.

- [ ] **Step 4: Auto-select preview logically**

Interaction with Promo controls selects YouTube preview; interaction with Format/Tipografías/Fondos selects Nota. Manual selector remains authoritative until the next explicit editor interaction.

- [ ] **Step 5: Use the same normalization/render values as runtime**

The sample card must match runtime semantics for scale, offsets, typography sizes, opacity, thumbnail scale, radius and title line clamp.

- [ ] **Step 6: Run checks**

```bash
node scripts/check-v2lab-youtube-promo.js
node scripts/check-v2lab-responsive.js
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer-stabilization-lab28.js src/renderer-lab29.js src/output-youtube-promo.js src/control-stabilization-lab28.css src/control-0325.css scripts/check-v2lab-responsive.js scripts/check-v2lab-youtube-promo.js
git commit -m "feat: add youtube promo visual editor and preview"
```

---

### Task 6: Make Restaurar diseño non-destructive

**Files:**
- Modify: `src/renderer-0317.js` or the current renderer file owning `#resetDesign` on this branch
- Modify: `src/renderer-0325.js`
- Modify: `scripts/check-v2lab-profile-compat.js`
- Modify: `scripts/check-v2lab-responsive.js` if reset affects the new controls.

**Interfaces:**
- Produces a visual-key reset that preserves operational/nonvisual fields.

- [ ] **Step 1: Add a failing reset regression**

Seed `settings.visual.output` with:

```js
{
  standbyVideo:'C:/standby.mp4',
  standbyVideoUrl:'file:///standby.mp4',
  verticalVideoBackground:'C:/vertical.png',
  musicFile:'C:/music.mp3',
  youtubePromoDesign:{...custom},
  futureField:'must-survive'
}
```

After visual reset, assert standby/file/future operational fields survive while visual typography/colors/animation/promo design reset to defaults.

- [ ] **Step 2: Run check and verify RED**

```bash
node scripts/check-v2lab-profile-compat.js
```

- [ ] **Step 3: Replace whole-object reset with explicit visual key reset**

Do not assign `settings.visual.output={...DESIGN_DEFAULT,...keep}`. Merge resettable visual keys into the existing object.

- [ ] **Step 4: Re-run check to GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/renderer-0317.js src/renderer-0325.js scripts/check-v2lab-profile-compat.js
git commit -m "fix: preserve operational output settings on design reset"
```

---

### Task 7: Full regression, packaged smoke, build and manual acceptance matrix

**Files:**
- Modify only if failures reveal real regressions.
- Verify: `package.json`, `.github/workflows/*`, packaged smoke scripts.

**Interfaces:**
- Produces a green branch/build suitable for user download and manual test.

- [ ] **Step 1: Run syntax and full project checks**

```bash
npm run check
```

Expected: exit code 0.

- [ ] **Step 2: Run critical checks individually for readable diagnostics**

```bash
node scripts/check-v2lab-responsive.js
node scripts/check-v2lab-youtube-promo.js
node scripts/check-v2lab-lab29-youtube-monitor.js
node scripts/check-v2lab-network-permissions.js
node scripts/check-v2lab-lan-output.js
node scripts/check-v2lab-ndi.js
node scripts/check-v2lab-profile-compat.js
```

Expected: all green.

- [ ] **Step 3: Verify responsive acceptance matrix**

Test widths/heights from the spec and continuous crossing:

```text
1500x940
1366x768
1250x800
1200x800
1181x800
1180x800
1179x800
1100x720
1500 -> 1300 -> 1181 -> 1180 -> 1100 -> 1180 -> 1500
```

Acceptance: no horizontal page overflow, overlap, cut controls or deformed preview.

- [ ] **Step 4: Verify feature matrix manually/packaged**

```text
Design: format, safe guides, vertical background, animation, typography, custom fonts, fondos/casillas, transitions, standby
YouTube: OFF->ON first play, ON->OFF first play, design change after reserve, repeated play, ads no promo
Salida: Output master status, permissions/UAC, LAN URL/port/connections, NDI name/FPS/audio/receivers
Profiles: switch profile at narrow width, import legacy profile, no cross-profile promo leakage
Output parity: local Output, Monitor, LAN and NDI show the same composition
```

- [ ] **Step 5: Build portable artifact**

```bash
npm run dist:portable
```

- [ ] **Step 6: Run packaged smoke scripts used by the workflow**

Expected: all packaged smoke tests green for Lab.29 naming/version compatibility.

- [ ] **Step 7: Push and wait for GitHub Actions**

Do not report completion while workflow is red/pending. Fix regressions and rerun until green.

- [ ] **Step 8: Final verification commit only if needed**

```bash
git status
git log --oneline --decorate -n 10
```

Expected: clean tree, all intended commits on `lab29-youtube-monitor-persistence`.
