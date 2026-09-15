# GEC V2.0 TTS Lab.28 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Lab.28 as a stabilization release that fixes confirmed multi-profile, exclusive scheduling, YouTube promo, monitor, permissions UX, layout, and optimization-state regressions without degrading Output/NDI/LAN/TTS quality.

**Architecture:** Keep the current layered GEC architecture and patch behavior at the shared integration points rather than profile-name-specific branches. Add targeted regressions for each confirmed failure, preserve existing release layers, and extend packaged smoke coverage before building the Windows portable artifacts.

**Tech Stack:** Electron, Node.js/CommonJS, native Windows C++ helper, Python embedded TTS runtime, GitHub Actions Windows build.

**Spec:** `docs/superpowers/specs/2026-09-10-lab28-stabilization-design.md`

## Global Constraints

- Version target is `2.0.0-lab.28`.
- No profile-name-specific logic for EC or Gestión.
- Monitor target is fixed 15 FPS and remains non-authoritative.
- Preserve Output, NDI, LAN, standby, transitions, music, content→ad, locked-ad identity, and profile import compatibility.
- Do not change Chatterbox quality parameters to chase benchmark numbers.
- Portable stays standard-user; firewall changes remain in the elevated owned-rule helper.

---

### Task 1: Version and regression gates

**Files:**
- Modify: `package.json`
- Modify/create: `scripts/check-v2lab-stabilization.js`
- Modify/create: `scripts/packaged-v2lab-stabilization-smoke.js`

**Interfaces:**
- Consumes: current Lab.27 release layers.
- Produces: one Lab.28 regression entry point included in `npm run check` and packaged smoke coverage.

- [ ] Write stabilization assertions for Lab.28 version, exclusive fallback, single 15 FPS monitor controller, promo playback enrichment, editable promo CTA, permission feedback states, and optimization profile linkage.
- [ ] Commit test-only changes and verify GitHub Actions fails for the intended missing Lab.28 behavior.
- [ ] Bump version and wire the new checks into package/build files only after RED is observed.

### Task 2: Producer liveness across all profiles

**Files:**
- Modify: `src/services/automation0325.js`
- Test: `scripts/check-v2lab-exclusive-planner.js`
- Test: `scripts/check-v2lab-stabilization.js`

**Interfaces:**
- Consumes: `processingSchedulerState`, `exclusiveReserve`, `candidateFrom`.
- Produces: producer behavior where due-exclusive priority never blocks public preparation when no eligible exclusive exists.

- [ ] Add a failing regression proving due-exclusive + zero eligible exclusives selects a public candidate.
- [ ] Verify RED against Lab.27 behavior.
- [ ] Implement minimal fallback after reserved/eligible-exclusive search is exhausted.
- [ ] Verify exclusive cadence tests and profile-independent liveness pass.

### Task 3: Profile-scoped optimization linkage and one status source

**Files:**
- Modify: `src/services/profilePolicy0329.js` and/or profile persistence layer owning machine/profile keys.
- Modify: `src/services/releaseV2Optimization.js`
- Modify: `src/services/releaseV2ProductionFidelity.js`
- Modify: `src/renderer-v2lab.js`
- Test: `scripts/check-v2lab-stabilization.js`

**Interfaces:**
- Consumes: machine benchmark data, active profile settings, production profile metadata.
- Produces: resolved optimization status with machine capability plus per-profile validation/linkage.

- [ ] Add a failing test proving two profiles can retain independent optimization linkage across switch/reload while sharing hardware benchmark facts.
- [ ] Verify RED.
- [ ] Move profile-specific validation/link fields out of machine-only exclusion while preserving backward migration from existing global data.
- [ ] Make renderer badge consume one resolved status path so a saved production profile cannot coexist with a contradictory forced `SIN OPTIMIZAR` writer.
- [ ] Verify old/current/new profile compatibility checks remain green.

### Task 4: YouTube promo end-to-end playback and editable CTA

**Files:**
- Modify: `src/services/releaseV2YoutubePromo.js`
- Modify: `src/services/youtubePromoLab27.js`
- Modify: actual canned playback integration point in `src/services/release0331.js` or Lab.28 wrapper layer.
- Modify: `src/output-youtube-promo.js`
- Modify: `src/renderer-youtube-promo.js`
- Modify: relevant Diseño de emisión renderer/settings UI.
- Test: `scripts/check-v2lab-youtube-promo.js`
- Test: `scripts/check-v2lab-stabilization.js`

**Interfaces:**
- Consumes: resolved canned content item + YouTube linkage + design settings.
- Produces: final `output:story` payload with `youtubePromo` snapshot including `ctaText`.

- [ ] Add a failing integration-style regression proving both automatic and manually scheduled canned playback enrich the final Output payload.
- [ ] Add a failing regression proving CTA text is profile-persisted and may be blank.
- [ ] Verify RED.
- [ ] Move/enforce enrichment on the actual final canned playback path rather than a bypassed parent reference.
- [ ] Read CTA text from Diseño de emisión profile settings and render it only when non-empty.
- [ ] Verify news/ads/standby never receive the promo and 5/7/10-second trigger logic remains unchanged.

### Task 5: Monitor 15 FPS with production priority

**Files:**
- Modify: `src/renderer-lan-output.js`
- Modify: `src/renderer-monitor-live-lab27.js` or replace with Lab.28 single-controller implementation.
- Modify only if needed: `src/main.js`
- Test: `scripts/check-v2lab-monitor-production.js`
- Test: `scripts/check-v2lab-stabilization.js`

**Interfaces:**
- Consumes: `captureOutputMonitorFrame`, production busy state, document visibility.
- Produces: one capture scheduler targeting ~66.7 ms intervals without overlapping captures.

- [ ] Add failing assertions for a single controller and 15 FPS target.
- [ ] Verify RED.
- [ ] Consolidate duplicate 900 ms refresh loops into one controller; keep LAN/NDI status polling separate.
- [ ] Preserve benchmark suspension, AI/TTS/GPU busy backoff, hidden-window backoff, and `monitorCaptureBusy` non-overlap.
- [ ] Verify no Output/NDI/LAN timing code changed.

### Task 6: Network-permission operator feedback

**Files:**
- Modify: `src/services/networkPermissions.js`
- Modify: `src/services/releaseV2NetworkPermissions.js`
- Modify: `src/renderer-lan-output.js`
- Test: `scripts/check-v2lab-network-permissions.js`
- Test: `scripts/check-v2lab-stabilization.js`

**Interfaces:**
- Consumes: current helper result/error and Windows `runas` orchestration.
- Produces: explicit `requesting`, `configured`, `cancelled/elevation`, and `policy/blocked` operator states.

- [ ] Add failing assertions for immediate busy feedback and differentiated result codes/messages.
- [ ] Verify RED.
- [ ] Keep helper security model unchanged; classify orchestration errors without password handling.
- [ ] Render explicit feedback and always refresh final permission status.
- [ ] Verify helper self-test and LocalSubnet/Domain+Private restrictions remain green.

### Task 7: Compact Automático layout

**Files:**
- Modify: relevant control CSS files and renderer-injected markup for Preparation/Exclusives/Control/Queue.
- Test: `scripts/check-v2lab-stabilization.js`

**Interfaces:**
- Consumes: existing operational controls and monitor placement.
- Produces: same controls with less left-column vertical stacking and no loss of readability.

- [ ] Add static regression assertions for compact class/layout hooks and monitor remaining top-right.
- [ ] Verify RED.
- [ ] Compact explanatory copy, rows and spacing; keep control buttons legible; give Control de emisión/queue earlier vertical priority.
- [ ] Verify responsive and startup UI smoke tests pass.

### Task 8: Chatterbox reproducibility audit without speculative quality changes

**Files:**
- Modify: TTS provisioning/runtime diagnostics files identified by repository audit.
- Modify: `src/tts_lab_worker.py` and/or runtime status only if needed for diagnostic metadata.
- Test: `scripts/check-v2lab-stabilization.js` and existing voice consistency/hardening tests.

**Interfaces:**
- Consumes: installed Python package metadata, model cache/revision metadata.
- Produces: diagnostics that report exact Chatterbox package/revision and immutable provisioning pins where a verified known revision is available.

- [ ] Compare Lab.20 and Lab.27 provisioning/runtime dependency declarations and identify exact mutable inputs.
- [ ] Add failing regression requiring package/model revision diagnostics and immutable pins where safe.
- [ ] Verify RED.
- [ ] Implement pins/diagnostics without changing production seed, temperature, chunking, voice reference or audio quality settings.
- [ ] Verify voice consistency, LatAm-only, production fidelity and runtime-isolation suites remain green.

### Task 9: Full verification and Windows artifacts

**Files:**
- Modify only regressions revealed by verification.

**Interfaces:**
- Produces: releasable Lab.28 build.

- [ ] Run full static/regression suite in GitHub Actions.
- [ ] Fix any failure by root cause, adding/updating a regression only when behavior is intentional.
- [ ] Verify packaged startup, architecture, TTS, profile, queue, standby, NDI, LAN, network-permission and promo smoke tests.
- [ ] Confirm workflow conclusion is `success`.
- [ ] Confirm both portable EXE and portable folder artifacts exist before reporting ready.
