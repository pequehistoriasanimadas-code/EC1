# Lab.27 YouTube Content Promo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir promos de YouTube vinculadas por contenido, con caché/deduplicación/actualización, preservar programación manual y corregir el monitor congelado durante producción normal.

**Architecture:** Un módulo de release Lab.27 se carga después de la infraestructura de perfiles de 0.3.29 y parchea únicamente los puntos de extensión necesarios: `SettingsStore` para configuración por perfil + secreto global, y `CannedManager` para añadir snapshots de promo a los contenidos. La UI se añade como renderer independiente usando las APIs existentes `getSettings/saveSettings/cannedList`; las operaciones asíncronas de YouTube se despachan mediante comandos efímeros interceptados por el módulo, evitando ampliar el preload heredado. Un controlador Output independiente renderiza la promo desde el snapshot del payload, por lo que Output local, NDI y LAN comparten exactamente los mismos datos y no consultan Internet al aire.

**Tech Stack:** Electron 43, Node.js CommonJS, Windows Portable, `https`/`crypto`/`fs`, YouTube Data API v3, HTML/CSS/JavaScript sin frameworks.

**Spec:** `docs/superpowers/specs/2026-09-10-youtube-content-promo-design.md` + `docs/superpowers/specs/2026-09-10-monitor-production-refresh-amendment.md`

## Global Constraints

- La función YouTube vive únicamente en `Contenidos / Anuncios`.
- Solo se muestran miniatura, título y canal; nunca visualizaciones ni fecha.
- La promo solo puede aparecer en CONTENIDO y nunca en noticias, anuncios, standby ni otro contenido fuera de su propio umbral.
- Entrada por fade in; no existe fade out; al abandonar CONTENIDO se elimina de inmediato antes de la siguiente salida.
- Tiempo global permitido: 5, 7 o 10 segundos; default 10 segundos.
- Deduplicación y TTL se calculan por `videoId`; actualización automática máxima una vez cada 24 horas.
- La API key de YouTube es global de la instalación, cifrada, y nunca se exporta en perfiles.
- Perfiles 0.3.x, Lab.25 y Lab.26 deben cargar sin error con promo desactivada y vínculos vacíos.
- `Programar como próximo` por contenido debe seguir visible y funcional, con prioridad sobre rotación automática.
- El monitor debe actualizarse durante IA/TTS/producción normal y suspenderse únicamente durante optimización/benchmark explícito.
- No se modifica la lógica funcional de NDI, LAN, anuncios post-contenido, exclusivas, contadores, standby ni música salvo para transportar/renderizar el snapshot YouTube.

---

### Task 1: Regression gate and monitor refresh fix

**Files:**
- Create: `scripts/check-v2lab-youtube-promo.js`
- Create: `scripts/check-v2lab-monitor-production.js`
- Modify: `src/renderer-lan-output.js`

**Interfaces:**
- Consumes: `window.ECAPI.outputMonitorFrame()`, `optimizerActive()` and the existing monitor timer.
- Produces: monitor refresh that is independent from `automationState.processing.aiBusy/voiceBusy/gpuStageBusy`.

- [ ] **Step 1: Write the failing monitor regression check**

Create a static/runtime-oriented Node check that reads `renderer-lan-output.js` and asserts the refresh path no longer returns because of `productionGpuBusy()`, while retaining `optimizerActive()` and `outputMonitorFrame()`:

```js
const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync('src/renderer-lan-output.js','utf8');
assert(src.includes('optimizerActive()'));
assert(src.includes('outputMonitorFrame()'));
assert(!/if\s*\(productionGpuBusy\(\)\)[\s\S]{0,260}?return;/.test(src));
console.log('Lab.27 monitor production refresh: OK');
```

- [ ] **Step 2: Run the monitor check and verify RED**

Run: `node scripts/check-v2lab-monitor-production.js`
Expected: FAIL because Lab.26 still exits early when normal production reports GPU/IA/TTS busy.

- [ ] **Step 3: Remove only the normal-production pause guard**

In `refreshMonitor()`, delete the early return based on `productionGpuBusy()` and remove `productionGpuBusy()` if it becomes unused. Preserve `optimizerActive()`, `monitorBusy`, `monitorActive`, the 900 ms interval and the backend benchmark suspension.

- [ ] **Step 4: Verify monitor check GREEN**

Run: `node scripts/check-v2lab-monitor-production.js`
Expected: PASS.

- [ ] **Step 5: Create the initial YouTube regression check in RED**

`check-v2lab-youtube-promo.js` must assert the future module/assets/contracts exist: URL parser, 24h TTL, 5/7/10 lead validation, content-only gate, immediate clear, dedupe by videoId, API key non-profile storage, renderer control labels, Output overlay files, and preserved `cannedScheduleSpecific`/`cannedCancelSpecific` APIs.

- [ ] **Step 6: Run it and verify RED**

Run: `node scripts/check-v2lab-youtube-promo.js`
Expected: FAIL because Lab.27 implementation files do not exist yet.

- [ ] **Step 7: Commit monitor correction + red feature gate**

```bash
git add scripts/check-v2lab-monitor-production.js scripts/check-v2lab-youtube-promo.js src/renderer-lan-output.js
git commit -m "test: gate Lab.27 promo and keep monitor live during production"
```

### Task 2: YouTube metadata service, machine secret and cache semantics

**Files:**
- Create: `src/services/youtubePromoLab27.js`
- Test: `scripts/check-v2lab-youtube-promo.js`

**Interfaces:**
- Produces: `parseYouTubeVideoId(url) -> string`, `normalizePromo(settings) -> settings`, `contentIdentity(item) -> string`, `YoutubePromoLab27` methods `setApiKey`, `hasApiKey`, `link`, `unlink`, `refreshVideo`, `refreshAll`, `decorateContent`, `runtimeStatus`.
- Storage: machine secret `EC Automatic News Data/youtube-promo-machine.json`; profile data `settings.canned.youtubePromo`.

- [ ] **Step 1: Add parser/default/identity unit assertions**

Test watch, youtu.be, shorts and live URL forms; reject non-YouTube URLs. Assert defaults are `{enabled:false, leadSeconds:10, links:{}, videos:{}}`, and clamp lead seconds to 5/7/10.

- [ ] **Step 2: Implement parser, normalization and stable content identity**

Implement `contentIdentity(item)` as SHA-256 over version tag + size + first/last bounded byte windows when the local file is readable; fallback to normalized basename + size. Prefix `ytc1_` to version the identity format.

- [ ] **Step 3: Add secret-storage assertions**

Assert the key is written only to the machine file via `SettingsStore.prototype.encryptSecret` and never under `canned.youtubePromo`.

- [ ] **Step 4: Implement machine secret storage**

`setApiKey(value)` encrypts non-empty values and atomically writes `youtube-promo-machine.json`; `apiKey()` decrypts it; `hasApiKey()` returns a boolean. No API key is returned to renderer status.

- [ ] **Step 5: Add dedupe/TTL/failed-refresh assertions**

Use injectable HTTP functions in tests so two content links with the same `videoId` produce one metadata record. Assert `refreshAll(false)` skips records refreshed less than 24 h ago; `refreshVideo(videoId,true)` ignores TTL; failures retain old title/channel/thumbnail.

- [ ] **Step 6: Implement YouTube Data API v3 fetch**

Use one `videos.list?part=snippet&id=id1,id2...&key=...` request for up to 50 unique IDs per batch. Normalize `snippet.title`, `snippet.channelTitle`, and best thumbnail preference `maxres > standard > high > medium > default`.

- [ ] **Step 7: Implement atomic thumbnail cache**

Download to profile assets as `youtube-<videoId>.<ext>.tmp`, verify non-empty image bytes/content type, then rename atomically. Preserve prior file on failure. `decorateContent()` converts cached thumbnail to a data URL for transport so remote LAN Output never accesses a local file path.

- [ ] **Step 8: Run focused feature check**

Run: `node scripts/check-v2lab-youtube-promo.js`
Expected: service-layer assertions pass; UI/output assertions may remain RED until later tasks.

- [ ] **Step 9: Commit service**

```bash
git add src/services/youtubePromoLab27.js scripts/check-v2lab-youtube-promo.js
git commit -m "feat: add deduplicated YouTube promo metadata service"
```

### Task 3: Profile integration and CannedManager decoration

**Files:**
- Create: `src/services/releaseV2YoutubePromo.js`
- Modify: `src/bootstrap-v2lab.js`
- Test: `scripts/check-v2lab-youtube-promo.js`

**Interfaces:**
- Consumes: post-0.3.29 `SettingsStore` profile routing; `CannedManager` methods patched by `profilePolicy0329`.
- Produces: profile-local promo settings/links, runtime action dispatch, content payload property `youtubePromo`, and UI runtime state exposed through existing `getSettings/saveSettings` without modifying preload.

- [ ] **Step 1: Add compatibility assertions before implementation**

Assert normalization of a settings object with no `canned.youtubePromo` does not throw and yields disabled/10/empty. Assert profile export shape cannot contain `apiKey`, `apiKeyEnc`, `keyEnc`, `pendingCommand` or runtime fields.

- [ ] **Step 2: Patch SettingsStore after profile routing**

Wrap `load()` to normalize `canned.youtubePromo` and append an ephemeral top-level `youtubePromoRuntime` snapshot. Wrap `save(settings)` to strip `youtubePromoRuntime` and intercept a top-level `__youtubePromoCommand` before calling the inherited profile save. Commands: `set-key`, `settings`, `link`, `unlink`, `refresh-one`, `refresh-all`.

The command wrapper must clone/strip command data before persistence and schedule async YouTube work without blocking the synchronous profile save. Results update in-memory runtime status and persisted profile metadata only after successful completion.

- [ ] **Step 3: Wrap CannedManager return methods after 0.3.29 routing**

Decorate content items from `list`, `peek`, `pick`, `peekForDuration`, `pickForDuration`, and `pickPath`. Never decorate the ads manager. Each decorated item includes `youtubeContentKey` and a snapshot `youtubePromo` only when global promo is enabled, a valid link exists, and cached metadata exists.

Snapshot shape:

```js
{
  enabled:true,
  videoId:'...',
  title:'...',
  channel:'...',
  thumbnailDataUrl:'data:image/...;base64,...',
  leadSeconds:10
}
```

- [ ] **Step 4: Load Lab.27 module from bootstrap**

Add `require('./services/releaseV2YoutubePromo').installReleaseV2YoutubePromo();` after existing Lab.26 release modules, so profile routing is already installed.

- [ ] **Step 5: Verify manual scheduling API remains untouched**

Run checks confirming `cannedScheduleSpecific` and `cannedCancelSpecific` still exist in preload and `reservePath/pickPath` remain in profile policy.

- [ ] **Step 6: Run feature + legacy profile checks**

Run:
`node scripts/check-v2lab-youtube-promo.js`
`node scripts/check-v2lab-profile-compat.js`
`node scripts/check-0329-manual-regressions.js`

Expected: PASS for profile/service/manual scheduling portions.

- [ ] **Step 7: Commit integration**

```bash
git add src/services/releaseV2YoutubePromo.js src/bootstrap-v2lab.js scripts/check-v2lab-youtube-promo.js
git commit -m "feat: integrate YouTube promos with profiles and contents"
```

### Task 4: Compact Contenidos UX and visible per-content scheduling

**Files:**
- Create: `src/renderer-youtube-promo.js`
- Create: `src/control-youtube-promo.css`
- Modify: `src/services/releaseV2YoutubePromo.js` (control-window injection only)
- Test: `scripts/check-v2lab-youtube-promo.js`

**Interfaces:**
- Consumes: existing `window.ECAPI.getSettings`, `saveSettings`, `cannedList`, `cannedScheduleSpecific`, `cannedCancelSpecific`.
- Produces: compact global promo controls, YouTube modal, row actions, internal list scroll.

- [ ] **Step 1: Add UX contract assertions**

Assert renderer contains labels/actions `Promo YouTube`, `5 s`, `7 s`, `10 s`, `Actualizar YouTube`, `Vincular`, `Actualizar`, `Programar próximo`, `Cancelar próximo`, and no views/date labels.

- [ ] **Step 2: Inject one compact global row in Programación de contenidos**

Place promo ON/OFF, lead select, global refresh and last-refresh status in the existing content card. If no key exists, show `Configurar YouTube` in this same area, opening a key modal; never navigate to Ajustes.

- [ ] **Step 3: Keep content rows single-height**

Observe/render `#cannedList` so each content row shows its existing filename + duration/size plus compact `Vincular/Vinculado` and `Programar próximo` action. Do not place thumbnail/title/channel inline. CSS gives the list a max height with internal vertical scroll.

- [ ] **Step 4: Implement modal**

Modal supports URL input, `Obtener datos`, cached thumbnail/title/channel preview, `Actualizar`, `Guardar`, `Cancelar`, and shared-video note when the same videoId has multiple linked contents. Poll runtime state after asynchronous commands until success/error or timeout.

- [ ] **Step 5: Preserve manual next state**

Use existing scheduling APIs, not a replacement scheduler. When the row is selected as next, render `PRÓXIMO` and `Cancelar próximo` without hiding YouTube status.

- [ ] **Step 6: Verify UX check**

Run: `node scripts/check-v2lab-youtube-promo.js`
Expected: UI assertions PASS.

- [ ] **Step 7: Commit UI**

```bash
git add src/renderer-youtube-promo.js src/control-youtube-promo.css src/services/releaseV2YoutubePromo.js scripts/check-v2lab-youtube-promo.js
git commit -m "feat: add compact YouTube controls to content library"
```

### Task 5: Output promo layer for local, NDI and LAN

**Files:**
- Create: `src/output-youtube-promo.js`
- Create: `src/output-youtube-promo.css`
- Modify: `src/services/releaseV2YoutubePromo.js` (local/NDI injection)
- Modify: `src/output-web.html`
- Test: `scripts/check-v2lab-youtube-promo.js`

**Interfaces:**
- Consumes: `output:story` payload property `youtubePromo`, base `cannedVideo`, `activeKind`, `stage`.
- Produces: one transient overlay DOM element; no network calls during playback.

- [ ] **Step 1: Add Output behavior assertions**

Assert controller gates on `kind==='canned'`, rejects `mediaRole==='ad'`, clears on every new story before evaluating it, clears on `ended/error/stop`, and triggers once at `duration-currentTime <= leadSeconds`.

- [ ] **Step 2: Implement `clearYouTubePromo()`**

Clear timer/state, remove visible class synchronously and reset overlay content immediately. This function is called before processing every incoming `output:story` and on canned ended/error/stop.

- [ ] **Step 3: Implement content-only snapshot and threshold**

On `output:story`, snapshot promo only for `kind==='canned' && mediaRole!=='ad'`. On `timeupdate`, show once when remaining crosses lead seconds. Do not inspect live profile state after start.

- [ ] **Step 4: Implement approved visual**

CSS: lower safe-area card ~38% width / compact height, thumbnail left, copy right, dark translucent surface, title/channel readable. `.visible` transitions opacity from 0 to 1 in ~350 ms. Clearing removes it with transitions disabled so there is no fade out.

- [ ] **Step 5: Make local/NDI receive assets**

The release module injects the CSS and controller into Electron Output windows after `output.html` loads, including the NDI mirror. Guard installation with `window.__ecYoutubePromoOutputInstalled`.

- [ ] **Step 6: Make LAN receive same assets**

Add `output-youtube-promo.css` and `output-youtube-promo.js` to `output-web.html`. Payload uses `thumbnailDataUrl`, so remote OBS/browser needs no YouTube/local filesystem access.

- [ ] **Step 7: Run focused Output checks**

Run: `node scripts/check-v2lab-youtube-promo.js`
Expected: all Lab.27 feature assertions PASS.

- [ ] **Step 8: Commit Output layer**

```bash
git add src/output-youtube-promo.js src/output-youtube-promo.css src/output-web.html src/services/releaseV2YoutubePromo.js scripts/check-v2lab-youtube-promo.js
git commit -m "feat: render content-only YouTube promo on every output"
```

### Task 6: Version, package gates and complete regression matrix

**Files:**
- Modify: `package.json`
- Modify: existing workflow only if required to run/package new checks/assets.
- Test: all existing `npm run check` matrix plus Lab.27 checks.

**Interfaces:**
- Produces: version `2.0.0-lab.27`, packaged files included by `src/**/*`, Windows Portable artifact.

- [ ] **Step 1: Bump product version and description**

Set package version to `2.0.0-lab.27`. Extend `npm run check` with syntax checks for Lab.27 files and both new regression scripts; do not alter the production optimization profile compatibility string `2.0-lab.25` unless an existing test proves that separate format requires it.

- [ ] **Step 2: Run syntax/focused checks**

Run:
```bash
node --check src/services/youtubePromoLab27.js
node --check src/services/releaseV2YoutubePromo.js
node --check src/renderer-youtube-promo.js
node --check src/output-youtube-promo.js
node scripts/check-v2lab-monitor-production.js
node scripts/check-v2lab-youtube-promo.js
```
Expected: PASS.

- [ ] **Step 3: Run inherited regression matrix**

Run at minimum:
```bash
node scripts/check-v2lab-regression-matrix.js
node scripts/check-v2lab-long-session.js
node scripts/check-v2lab-ndi.js
node scripts/check-v2lab-lan-output.js
node scripts/check-v2lab-profile-compat.js
node scripts/check-0329-manual-regressions.js
node scripts/check-v2lab-network-permissions.js
npm run check
```
Expected: all PASS. Any regression is fixed before continuing.

- [ ] **Step 4: Commit release identity/gates**

```bash
git add package.json scripts src
git commit -m "release: prepare GEC V2.0 TTS Lab.27"
```

### Task 7: Windows CI, packaged smoke and artifact verification

**Files:**
- Modify only files required by evidence from CI failures.

**Interfaces:**
- Consumes: repository Windows workflow.
- Produces: green workflow run and downloadable Portable EXE artifact.

- [ ] **Step 1: Push branch/open PR and trigger Windows workflow**

Open PR from `lab27-youtube-content-promo` against the Lab.26 integration base used by the project. Confirm CI starts from the current Lab.27 head.

- [ ] **Step 2: Inspect every failing job/step before changing code**

For a red run, fetch job steps/logs, state one root-cause hypothesis, make the smallest fix, and rerun. Never bundle unrelated fixes.

- [ ] **Step 3: Verify packaged startup and existing native helpers**

Confirm CI passes packaged startup, NDI bridge smoke, network permission helper smoke, Qwen/Kokoro/Chatterbox inherited gates, profile import gates and Lab.27 checks.

- [ ] **Step 4: Verify artifacts**

Fetch workflow artifacts and confirm Portable EXE artifact exists and is non-empty. Record run ID, artifact ID, size and SHA-256 if supplied by GitHub.

- [ ] **Step 5: Final verification before completion claim**

Use `superpowers:verification-before-completion`; cite the fresh successful workflow/run and artifact metadata. Only then tell the user Lab.27 is green and provide the actual artifact download.
