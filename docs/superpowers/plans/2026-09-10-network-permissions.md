# GEC Network Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one in-app UAC action that configures the Windows firewall access required by both GEC NDI and Output LAN while keeping the main Electron process non-elevated.

**Architecture:** A native Windows helper owns firewall inspection/configuration. The Electron service invokes read-only status normally and launches only the helper through `runas` when the user clicks the single configure button. The NDI bridge is copied to a stable `%LOCALAPPDATA%` location so its firewall application rule survives Portable updates.

**Tech Stack:** Electron 43, Node.js 22, MSVC C++17, Windows Firewall COM (`INetFwPolicy2` / `INetFwRule`), PowerShell `Start-Process -Verb RunAs`, electron-builder Portable.

**Spec:** `docs/superpowers/specs/2026-09-10-network-permissions-design.md`

## Global Constraints

- Keep `portable.requestExecutionLevel` equal to `user`.
- GEC must never collect or store administrator credentials.
- Configure one NDI application rule and one Output LAN TCP rule with a single UAC action.
- Limit automatic firewall access to Domain/Private profiles and `LocalSubnet`; never enable Public profile access.
- Preserve existing local Output, Output LAN, NDI High Bandwidth, monitor, queue, optimizer, and profile behavior.
- CI must never execute the firewall-changing `--configure` helper mode.
- Final delivery requires the Windows Portable workflow to be green.

---

### Task 1: Native Windows firewall helper

**Files:**
- Create: `src/native/network_permissions.cpp`
- Create: `scripts/check-v2lab-network-permissions.js`

**Interfaces:**
- Consumes: CLI modes `--self-test`, `--status`, `--configure`; `--bridge=<absolute path>`; `--lan-port=<1024-65535>`.
- Produces: status JSON on stdout and exit code 0 for valid self-test/status; configuration exit code 0 only when both GEC rules are created and verified.

- [ ] **Step 1: Write the failing static regression check**

Create a Node check that asserts the helper source defines the two exact rule names, uses `LocalSubnet`, Domain/Private profiles, validates elevation for configure mode, and contains no shell-command execution.

- [ ] **Step 2: Run the check and confirm it fails because the helper does not exist yet**

Run: `node scripts/check-v2lab-network-permissions.js`
Expected: FAIL for missing `src/native/network_permissions.cpp`.

- [ ] **Step 3: Implement the native helper**

Use `INetFwPolicy2` and `INetFwRule`; status mode is read-only and does not require elevation. Configure mode checks the process token elevation, removes/replaces only `GEC Automatic News - NDI Bridge` and `GEC Automatic News - Output LAN`, creates the NDI application rule with any protocol, creates the LAN TCP rule for the selected port, sets inbound/allow/enabled, Domain|Private profiles, `LocalSubnet`, and verifies the resulting rules.

- [ ] **Step 4: Re-run the static helper check**

Run: `node scripts/check-v2lab-network-permissions.js`
Expected: PASS for native-helper contract assertions.

- [ ] **Step 5: Commit the helper/test unit**

Commit message: `lab.26: add elevated network permissions helper`

---

### Task 2: Stable NDI bridge deployment and network-permission service

**Files:**
- Modify: `src/services/outputNdi.js`
- Create: `src/services/networkPermissions.js`
- Create: `src/services/releaseV2NetworkPermissions.js`
- Modify: `src/bootstrap-v2lab.js`
- Extend: `scripts/check-v2lab-network-permissions.js`

**Interfaces:**
- Consumes: bundled NDI bridge at `runtime/ndi/gec-ndi-bridge.exe`, native helper at `runtime/network/gec-network-permissions.exe`, LAN config at `EC Automatic News Data/global/output-lan.json`.
- Produces: `stableBridgePath(dataDir)`, `deployStableBridge(...)`, `NetworkPermissions.status()`, `NetworkPermissions.configure()`, IPC `output:networkPermissionsStatus`, IPC `output:networkPermissionsConfigure`.

- [ ] **Step 1: Extend the failing regression check**

Assert that NDI deployment targets `%LOCALAPPDATA%\EC Automatic News\Network\gec-ndi-bridge.exe`, that the bundled bridge remains a fallback, that the network service invokes `runas` only from `configure()`, and that status/configure IPC handlers are installed by the V2 bootstrap.

- [ ] **Step 2: Verify the extended check fails**

Run: `node scripts/check-v2lab-network-permissions.js`
Expected: FAIL for missing JS service/IPC/stable deployment.

- [ ] **Step 3: Implement stable bridge deployment**

Add exported helper functions to `outputNdi.js`; copy the bundled bridge atomically to the stable per-user Network directory before starting NDI, compare hashes to refresh it across builds, fall back to the bundled bridge on copy failure, and expose deployment errors in NDI status without breaking local NDI startup.

- [ ] **Step 4: Implement `NetworkPermissions`**

Add hidden helper execution with timeout and JSON parsing. `status()` must be non-elevated. `configure()` must first ensure the stable bridge exists, skip UAC when both rules already match, otherwise launch the native helper through hidden PowerShell `Start-Process -Verb RunAs -Wait`, then call `status()` again. Normalize UAC cancellation, missing helper, corporate policy warnings, and unsupported platform.

- [ ] **Step 5: Register IPC in a V2-only installer**

`releaseV2NetworkPermissions.js` lazily creates the service, reads the configured LAN port, and registers the two handlers. `bootstrap-v2lab.js` installs it without changing legacy 0.3.x startup.

- [ ] **Step 6: Run regression check**

Run: `node scripts/check-v2lab-network-permissions.js`
Expected: PASS.

- [ ] **Step 7: Commit the service unit**

Commit message: `lab.26: add UAC network permission orchestration`

---

### Task 3: One-button Emisión UI and preload bridge

**Files:**
- Modify: `src/preload.js`
- Modify: `src/renderer-lan-output.js`
- Modify: `src/control-lan-output.css`
- Extend: `scripts/check-v2lab-network-permissions.js`

**Interfaces:**
- Consumes: `ECAPI.outputNetworkPermissionsStatus()` and `ECAPI.configureOutputNetworkPermissions()`.
- Produces: one `Permisos de red` card, separate NDI/LAN status indicators, one `Configurar permisos de red` action, and clear cancelled/GPO/error messaging.

- [ ] **Step 1: Add failing UI/preload assertions**

Assert the two preload methods exist, exactly one configure button is created, the UI never contains a password field, and LAN-port changes trigger a permission-status refresh.

- [ ] **Step 2: Verify the UI assertions fail**

Run: `node scripts/check-v2lab-network-permissions.js`
Expected: FAIL for missing UI/API.

- [ ] **Step 3: Expose narrow preload methods**

Add only the two invoke wrappers; do not expose shell/process/firewall primitives to the renderer.

- [ ] **Step 4: Add the permission card and behavior**

Insert it above LAN/NDI settings. It must render NDI and LAN as permitted/pending/error; show UAC guidance; disable the button while UAC is active; show a non-fatal message on cancellation; and refresh after a LAN port change, profile change, and successful configuration.

- [ ] **Step 5: Add minimal responsive CSS**

Match the existing dark Premiere-like styling and keep the card compact on narrow widths.

- [ ] **Step 6: Run UI/static checks**

Run: `node scripts/check-v2lab-network-permissions.js`
Expected: PASS.

- [ ] **Step 7: Commit the UI unit**

Commit message: `lab.26: add one-button network permissions UI`

---

### Task 4: Build, package, version, and packaged smoke coverage

**Files:**
- Modify: `.github/workflows/build-windows.yml`
- Modify: `package.json`
- Create: `scripts/packaged-v2lab-network-permissions-smoke.js`
- Extend: `scripts/check-v2lab-network-permissions.js`

**Interfaces:**
- Consumes: MSVC source `src/native/network_permissions.cpp`.
- Produces: packaged `resources/runtime/network/gec-network-permissions.exe` and lab.26 Portable artifact.

- [ ] **Step 1: Add failing packaging assertions**

Assert package version `2.0.0-lab.26`, `requestExecutionLevel: user`, the new checks are in `npm run check`, the smoke script is packaged, and workflow compiles/self-tests the helper without running configure mode.

- [ ] **Step 2: Verify packaging assertions fail**

Run: `node scripts/check-v2lab-network-permissions.js`
Expected: FAIL until package/workflow are updated.

- [ ] **Step 3: Update build workflow**

Compile the helper with the same MSVC toolchain used for the NDI bridge; output to `runtime/network/gec-network-permissions.exe`; run only `--self-test` in CI.

- [ ] **Step 4: Update package metadata/check pipeline**

Bump only the application package version to lab.26; keep the production TTS profile schema/version untouched because this feature does not invalidate optimization profiles. Add JS syntax/static checks and package both new smoke scripts through the existing `files` list; `runtime/**/*` continues to package the compiled native helper.

- [ ] **Step 5: Add packaged helper smoke test**

Verify the packaged helper exists and `--self-test` exits 0. Do not alter firewall state.

- [ ] **Step 6: Run all static/regression checks available locally/CI**

Run: `npm run check`
Expected: all checks pass.

- [ ] **Step 7: Commit build/package unit**

Commit message: `lab.26: package and validate network permission helper`

---

### Task 5: Full regression audit and Windows artifact

**Files:**
- Review all changed files.
- Update regression checks only for genuine lab.26 expectations; do not weaken existing behavior assertions.

**Interfaces:**
- Produces: green GitHub Actions Windows Portable build and downloadable EXE artifact.

- [ ] **Step 1: Compare lab.26 branch against lab.25 head**

Verify changes are limited to the approved permission feature, stable NDI bridge path, UI wiring, version/package/build/test updates, and documentation.

- [ ] **Step 2: Open a PR to `main`**

Use a descriptive lab.26 title and include the firewall/UAC security constraints in the body.

- [ ] **Step 3: Watch the Windows workflow**

Require Static and regression checks, native helper compile/self-test, packaged startup tests, NDI smoke tests, and all legacy compatibility checks to complete green.

- [ ] **Step 4: Fix any red CI result before reporting completion**

Do not present a download from a failed or cancelled run.

- [ ] **Step 5: Download and surface the final Portable EXE artifact**

Only after the final workflow conclusion is `success`.
