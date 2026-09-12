# Lab.29 UX Regression Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the visual/UX regressions reported in Diseño de emisión, Audio y locución, and Contenidos / Anuncios without changing the established TTS, queue, profile, Output, LAN or NDI authorities.

**Architecture:** Keep existing runtime/service sources of truth and repair the renderer/layout layer. Diseño de emisión must once again preview the same full-frame gradient geometry as Output; Audio must render its visible learning controls directly in their final compact/icon form instead of depending on a later transformation layer; Contenidos/Anuncios must use two independent vertical columns so the ads library occupies the unused right-side space. Global duplicated tab H1 headings are visually hidden while card/subsection headings remain.

**Tech Stack:** Electron renderer JavaScript, CSS Grid/Flexbox, existing Node static regression gates, GitHub Actions Windows portable build/smoke suite.

**Spec:** Conversation-approved UX decisions captured in the Lab.29 branch and prior Design/Auto specs.

## Global Constraints

- Work only on `lab29-youtube-monitor-persistence`, never `main`.
- Preserve Output real geometry and its existing fullscreen `#shade` / `.snapshot-shade` implementation.
- Preserve one profile-scoped `tts.referenceVoiceId`; do not create a second voice-selection authority.
- Preserve Chatterbox/Qwen/Kokoro routing and the shared pronunciation/ES-PE normalizer pipeline.
- Kokoro-only initial-attack controls must not appear for Chatterbox/Qwen.
- No resize-time DOM reparenting; responsive behavior must remain CSS-driven.
- Do not duplicate queue, Output, LAN, NDI, promo, or profile state.
- CI success is necessary but manual visual validation remains distinct from automated verification.

---

### Task 1: Strengthen regression gates before fixes

**Files:**
- Modify: `scripts/check-v2lab-emission-design-v2.js`
- Modify: `scripts/check-v2lab-audio-ux-lab29.js`
- Create: `scripts/check-v2lab-layout-ux-lab29.js`
- Modify: `scripts/check-v2lab-lab29-youtube-monitor.js`

- [ ] Add assertions that Note preview has an independent fullscreen shade element, transparent text container, 42%/38% gradient stops, real image/fallback media, compact background-control symbols, and overflow-safe opacity value.
- [ ] Add assertions that the visible `ec28` pronunciation rows directly create icon-only Save/Delete buttons with title/ARIA, not text buttons later transformed by another script.
- [ ] Add assertions that shared normalizer copy is engine-neutral and Kokoro-only attack controls are conditionally hidden outside Kokoro.
- [ ] Add assertions that top-level tab H1s are visually suppressed globally while card headings remain.
- [ ] Add assertions that `tab-canned` is reflowed into independent left/right stacks with Ads directly beneath available contents.
- [ ] Run CI and confirm RED occurs on the new contracts while legacy gates remain otherwise healthy.

### Task 2: Repair Diseño de emisión preview and compact controls

**Files:**
- Modify: `src/renderer-emission-design-v2.js`
- Modify: `src/control-emission-design-v2.css`

- [ ] Add dedicated `ecV2NoteShade` between preview media and Note text.
- [ ] Render the shade as `linear-gradient(transparent 42%, rgba(...) 100%)` for 16:9 and `38%` for 9:16.
- [ ] Remove the background from `.ec-v2-note-preview`; only Categoría and Exclusivo retain their own background boxes.
- [ ] Make preview media use the current effective/fallback image when available, retaining a neutral fallback only when no image exists.
- [ ] Restore compact symbol-led controls for Fondo/Casillas (`■`, `▢`, `◐`) with accessible titles/labels.
- [ ] Replace nested overflow-prone opacity grid with a single compact opacity control whose numeric value and `%` suffix cannot wrap or escape at 0/5/88/100.
- [ ] Preserve Output renderer/CSS unchanged.

### Task 3: Repair Audio y locución final rendered UX

**Files:**
- Modify: `src/renderer-0326.js`
- Modify: `src/renderer-0328.js`
- Modify: `src/renderer-audio-ux-lab29.js`
- Modify: `src/control-audio-ux-lab29.css`

- [ ] Change normalizer help text to engine-neutral copy describing preprocessing before the active TTS engine.
- [ ] Make the visible `ec28LearningList` create Save/Trash SVG icon buttons directly, with tooltips/ARIA and disabled-state behavior.
- [ ] Compact the learning toolbar and make clear-learning a secondary trash action without changing its confirmation/API.
- [ ] Rename the folded pronunciation test to `Probar locución procesada`.
- [ ] Keep one generic diagnostic destination (`Texto enviado al motor TTS`) and eliminate visible Kokoro-specific duplicate diagnostic labels.
- [ ] Hide `Protección del ataque inicial` and `Margen inicial para vocales` unless active engine is Kokoro; preserve their values/settings.
- [ ] Keep multiple reference voices and profile-scoped active voice unchanged.

### Task 4: Repair global page hierarchy and Contenidos / Anuncios layout

**Files:**
- Create: `src/control-ux-cleanup-lab29.css`
- Create: `src/renderer-ux-cleanup-lab29.js`
- Modify: `src/preload.js`

- [ ] Visually hide `.tab > h1` across all tabs because navigation already provides current-section identity; retain DOM semantics.
- [ ] Remove/reduce only redundant generic top subtitles; do not remove card titles.
- [ ] Build stable `#ec29CannedLeft` and `#ec29CannedRight` hosts once at startup, moving existing cards rather than cloning them.
- [ ] Put Programación/configuration on the left; Contenidos disponibles then Anuncios on the right.
- [ ] Give content/ad lists internal max-height scrolling so large libraries do not elongate the entire page indefinitely.
- [ ] Collapse to one column responsively via CSS only.

### Task 5: Full verification and packaged build

**Files:**
- Modify gates only if an uncovered regression is discovered.

- [ ] Run full `npm run check` through CI and inspect the complete diagnostic log.
- [ ] Confirm existing profile, P/P/P/E, queue, manual content, promo, Output, LAN, NDI, responsive, TTS, Chatterbox, Qwen, LatAm and historical compatibility gates remain green.
- [ ] Wait for Windows Portable build to complete.
- [ ] Confirm packaged executable startup and all packaged smoke tests pass.
- [ ] Confirm both Portable Folder and Windows Portable EXE artifacts are produced.
- [ ] Report final commit SHA and workflow/build number only after fresh SUCCESS evidence.
