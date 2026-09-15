# GEC Network Permissions Design

## Goal

Add one in-app action that requests Windows administrator approval through UAC and configures the network permissions required by both GEC NDI output and Output LAN, without requiring the user to open CMD or run the whole application as administrator.

## Approved user experience

The Emisión settings page gains a compact **Permisos de red** card. It reports the NDI permission and Output LAN permission separately, but exposes one primary action: **Configurar permisos de red**. Pressing it launches the normal Windows UAC credential/consent dialog. GEC never asks for, reads, stores, or transmits administrator credentials.

If the user accepts UAC and the rules are effective, the card reports both permissions as enabled. If UAC is cancelled, GEC continues normally and local Output/NDI remain available. If corporate Group Policy prevents local firewall changes, GEC reports that the organization policy may require IT assistance instead of silently failing.

## Architecture

GEC remains packaged with `requestExecutionLevel: user`; the Electron main process is never elevated. A new small native Windows helper, `gec-network-permissions.exe`, performs only firewall inspection/configuration. Normal status inspection runs without elevation. Configuration is launched through Windows `runas`, so only that helper is elevated for the duration of the change.

The existing NDI sender bridge is deployed to a stable per-user path under `%LOCALAPPDATA%\EC Automatic News\Network\gec-ndi-bridge.exe`. `OutputNdi` uses that stable copy when available. This prevents a firewall application rule from becoming stale when the Portable build is extracted to a different temporary path after an update.

The helper configures two inbound rules, both limited to Domain/Private profiles and `LocalSubnet`:

1. **GEC Automatic News - NDI Bridge** — application rule for the stable `gec-ndi-bridge.exe`, inbound allow, any protocol. This intentionally follows the NDI process rather than pinning only 5960/5961 because NDI can use 5353 UDP, 5960+, 6960+, and 7960+ depending on discovery/transport/connection mode.
2. **GEC Automatic News - Output LAN** — TCP inbound allow for the currently configured Output LAN port (default 8787).

Public-profile access is not enabled automatically.

## Components

### `src/native/network_permissions.cpp`

A narrow native helper built with MSVC. It supports:

- `--self-test`: validates argument/runtime availability without changing Windows.
- `--status --bridge=<path> --lan-port=<port>`: reads matching firewall rules through `INetFwPolicy2` and returns compact JSON to stdout.
- `--configure --bridge=<path> --lan-port=<port>`: requires an elevated token, removes/replaces only the two GEC-owned rules, then verifies them and returns success/failure via exit code.

Arguments are validated: bridge filename must be `gec-ndi-bridge.exe`, LAN port must be 1024-65535, and the NDI rule is restricted to the supplied application only. The helper never runs arbitrary shell commands.

### `src/services/networkPermissions.js`

Owns the non-elevated orchestration:

- computes the stable NDI bridge location;
- copies/refreshes the bundled bridge before NDI starts;
- runs helper status checks hidden;
- launches the helper through a hidden PowerShell `Start-Process -Verb RunAs` only when the user clicks the configure button;
- re-checks the firewall after UAC closes;
- normalizes cancelled-UAC, missing-helper, unsupported-platform, and Group Policy states for the UI.

The PowerShell invocation is an implementation detail only; no console is shown and no user command entry is required.

### `src/services/outputNdi.js`

Accepts a stable bridge path/deployment function while preserving the existing bundled bridge as a fallback. Existing NDI behavior, transport, receiver count, audio, and reconnect logic remain unchanged.

### V2 bootstrap integration

A V2-only network-permissions installer registers IPC handlers for status/configure before the control UI begins normal interaction. It derives the current LAN port from `EC Automatic News Data/global/output-lan.json`, so changing the LAN port makes the permission state stale until the single configure action is run again.

### Renderer/preload

The preload exposes two narrow methods: `outputNetworkPermissionsStatus()` and `configureOutputNetworkPermissions()`. The Emisión renderer adds one permission card and never handles credentials.

## Failure behavior

- UAC cancelled: return `cancelled=true`; no error dialog; GEC continues.
- Helper missing: show build/runtime error; do not affect NDI/LAN/local output.
- Stable bridge copy fails: NDI may fall back to bundled bridge locally, but the permission card reports that the stable NDI firewall target could not be prepared.
- Group Policy/local-rule override: show an organization-managed warning and keep local features working.
- Output LAN port changes: permission status becomes pending for LAN until reconfigured.
- Existing matching rules: no UAC is requested merely by opening GEC; status is read-only.

## Security constraints

- Never elevate the Electron application.
- Never collect administrator credentials inside GEC.
- Never open firewall access on Public profiles automatically.
- Restrict inbound access to `LocalSubnet`.
- NDI rule is application-scoped; LAN rule is one TCP port only.
- Helper owns/removes/replaces only rule names prefixed `GEC Automatic News -` that are explicitly defined by this feature.

## Verification

CI must cover static JS checks, native helper compilation/self-test, packaged helper presence, stable bridge deployment logic, renderer single-button behavior, IPC exposure, version/profile compatibility, and the existing full regression matrix. CI must not modify GitHub runner firewall rules; `--configure` is not executed in CI. Final completion requires the Windows Portable workflow to be green before a download is presented.
