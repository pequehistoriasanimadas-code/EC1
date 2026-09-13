# Final UI Stability Lab.29 Implementation Plan

**Goal:** Stabilize Diseño de emisión and Automático without duplicating state or listeners.

**Architecture:** Keep existing controls as the only source of truth. Diseño uses one real 1920×1080 / 1080×1920 preview stage and one visual scale. Automático installs its base layout from stable nodes, then attaches Monitor, YouTube, ec28 and session counters independently when they appear.

## Tasks

1. Add a failing regression gate for the current failures: Promo double-scaling, Automático all-or-nothing prerequisites, repeated structural DOM work, large 9:16 background card, and incorrect Nota/Promo active state.
2. Stabilize Diseño: keep Nota as image -> fullscreen gradient -> text; render Promo at native stage sizes; make header/transitions structural changes one-time; compact Fondo videos 9:16; keep responsive behavior.
3. Stabilize Automático: use minimal prerequisites; create layout hosts once; attach late nodes independently; integrate existing emission controls in Monitor; absorb the legacy control card; reconcile after profile changes without duplication.
4. Run the focused gate, the existing Lab.29 aggregate checks, Static diagnostics and Windows Portable. Fix any red result before reporting completion.

## Acceptance

- Nota has no text rectangle and keeps fullscreen gradient 42%/38%.
- Promo preview is readable at both 16:9 and 9:16 with one scale only.
- Nota/Promo active styling matches the selected editor.
- Fondo videos 9:16 is a compact row with status and upload/delete actions.
- Automático always shows the approved strip/queue/monitor layout even if late nodes load later.
- No duplicate nodes/listeners after resize or profile switching.
- Static diagnostics and Windows Portable are SUCCESS.
