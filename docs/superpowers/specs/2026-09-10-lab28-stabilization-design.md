# GEC V2.0 TTS Lab.28 Stabilization Design

## Goal

Stabilize the current Lab.27 feature set without changing the established broadcast/output behavior, while fixing the confirmed regressions found during real profile switching and live-output testing.

## Scope

Lab.28 must address these user-confirmed issues:

1. The in-app emission monitor updates at roughly 1 FPS. It must refresh at a fixed target of 15 FPS while remaining subordinate to AI/TTS/GPU work and without changing master Output, NDI or LAN timing.
2. Any profile with exclusive scheduling enabled can stop producing public news when an exclusive turn is due but no eligible exclusive exists. No profile may block for this reason.
3. Optimization state currently has conflicting machine/profile ownership and two UI writers can disagree. Hardware benchmark data may remain machine-wide, but each profile must persist the production/validation linkage needed for a stable OPTIMIZADA/SIN OPTIMIZAR state across relaunches and profile switches.
4. A YouTube promo link can be successfully linked to a canned content item but never reach Output because the playback wrapper is bypassed by the 0.3.31 canned-content path. Manual-next and automatic canned playback must both carry the promo snapshot when the item is linked.
5. The YouTube promo CTA text currently hard-coded as “Mira el video aquí:” must be editable in Diseño de emisión, persisted per profile, and allowed to be blank.
6. Network-permission configuration can fail silently from the operator perspective. The UI must expose requesting, success, cancellation/elevation failure, and policy/administrative block states without requesting or storing administrator credentials.
7. The Automático screen has excessive vertical stacking on the left. Preserve legible live-operation controls, keep the monitor at the top-right, compact explanatory text, and reduce the vertical footprint of Preparation/Exclusives/Control so the queue remains visible sooner.
8. Chatterbox benchmark performance regressed in the current installation. Lab.28 must add reproducibility diagnostics and pin the Chatterbox Python package/model revision used by bundled setup where the existing repository/install information makes a safe immutable pin possible. Do not change voice-quality parameters or claim a speed restoration unless verified by a real benchmark.

## Invariants

- Existing old/current/new profile imports must continue to work.
- Gestión, EC, and any other profile use the same producer rules; there are no profile-name-specific fixes.
- If an exclusive is due: use an eligible reserved exclusive first; otherwise seek an eligible exclusive; if none exists, continue preparing public news and retry the exclusive opportunity later.
- Exclusives remain separated by the configured cadence when an exclusive is actually available.
- Content → advertisement behavior remains mandatory, including manual “Siguiente”, unless ads are disabled/unavailable.
- Selected advertisement identity remains locked after queue insertion unless its file disappears.
- Output standby, transitions, background music, NDI and LAN behavior are unchanged except where explicitly tested for non-regression.
- YouTube promo appears only for linked CONTENT, never standby/news/ads, at the configured 5/7/10 second threshold.
- Monitor 15 FPS is preview-only; it must not become the timing authority.
- Portable app continues to run as a standard user. Network firewall modification remains delegated to the elevated helper and is restricted to the existing owned rules and LocalSubnet.

## Architecture

### Producer/exclusive scheduling

Use the existing AutomationEngine scheduling state. A due exclusive changes selection priority, not producer liveness. The producer must fall back to a public candidate when there is no reserved or eligible exclusive after a forced feed refresh. This logic is shared by all profiles.

### Optimization ownership

Split machine facts from profile linkage. Machine-wide values describe hardware/runtime benchmark capability. Profile-owned data records the chosen production profile/engine validation for that profile. Renderer status must read one resolved status object rather than independently overwriting the same badge from separate sources. Legacy global optimization data may be migrated as a fallback when a profile has no profile-local linkage.

### YouTube promo

Promo enrichment must happen on the actual canned playback path that emits the final output payload, not on a stale parent method reference. The resolved canned item is decorated immediately before Output send. CTA text is sourced from per-profile design settings and copied into the promo snapshot.

### Network permissions

Keep the existing native helper and `runas` elevation design. Add explicit operation result classification and immediate UI busy/feedback. No password fields.

### Monitor/UI

Use one monitor refresh controller at ~66.7 ms target cadence. Do not overlap captures; skip frames while a capture is busy and preserve existing benchmark/production GPU suspension checks. LAN/NDI status polling stays low-frequency and separate. UX changes are CSS/layout-focused, not a reduction in operational readability.

### Chatterbox reproducibility

Record the installed `chatterbox-tts` package version and model revision/hash in diagnostics. Prefer immutable package/model pins in bundled provisioning if a known working revision is present in repository history. Do not alter seed, temperature, voice reference, chunk policy or quality behavior solely to improve RTF.

## Verification

Lab.28 is releasable only when:

- targeted regression tests demonstrate RED before the production fixes and GREEN after them;
- static and legacy compatibility suites pass;
- packaged Windows smoke tests pass;
- a multi-profile regression test proves switching profiles cannot leave either profile blocked by an unavailable exclusive or misreport optimization state;
- a promo integration test proves linked canned content reaches Output with promo metadata on both automatic and manually scheduled playback paths;
- monitor tests prove a single 15 FPS controller and preservation of GPU/benchmark suspension guards;
- GitHub Actions Windows build concludes success; and
- both portable folder and portable EXE artifacts are present.
