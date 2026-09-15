# Automático Operator UX — Design Specification

## Goal
Reorganize the `Automático` screen as an operator console without changing queue, preparation, emission, exclusive-content, YouTube, content, monitor, LAN/NDI, or profile behavior.

## Approved UX

### Global operator strip
At the top of `Automático`, show one compact strip with:
- Preparación state.
- Emisión state.
- Noticias listas / objetivo.
- Autonomía.
- `Contenidos` ON/OFF.
- `Promo YouTube` ON/OFF.
- Output state/resolution.

The existing `#cannedEnabled` and `#ecYoutubePromoEnabled` controls are moved here. They are not cloned. Their detailed configuration remains in `Contenidos / Anuncios`, but their activation switches no longer live there.

### Left column = what comes next
1. `Cola de emisión` is the dominant block.
2. `Iniciar preparación` / pause / resume / stop controls are available from the queue header.
3. Queue rows keep all current operational information: number, type, Exclusive badge, title, source/category, preparation/TTS metrics, wait reason, technical details, and state.
4. Queue rows do **not** add decorative type icons or thumbnails. Existing color accents + type/status badges remain the visual language.
5. The queue itself is the only visual source of truth for order. Do not add a separate `Próximo contenido` card or a `PRÓXIMO` badge.
6. Below the queue: compact `Preparación de noticias` settings and `Contenido exclusivo` settings.

### Right column = what is happening now
1. Monitor de emisión.
2. `Ahora al aire` summary derived from the current automation/output state.
3. `Control de emisión` using the existing emission buttons.
4. `Resumen de sesión` using the existing session counters and reset action.

### Icons
Use one consistent Lucide/Feather-like line style through CSS/SVG masks for navigation and operator-level actions/section headings. `Abrir Output` uses a monitor icon. Queue cards themselves receive no decorative icons.

## Architecture rules
- Existing controls are moved once after all prerequisite modules exist; they are never cloned.
- Do not rebuild/reparent elements on window resize. Responsive behavior is CSS-only.
- `#queue` remains rendered exclusively by the existing stable queue owner (`renderer-0332`).
- Moving `#cannedEnabled` must preserve its current change handler and profile persistence.
- Moving `#ecYoutubePromoEnabled` must preserve Lab.29's dedicated YouTube persistence path.
- The YouTube lead-time/API/refresh/link-management controls stay under `Contenidos / Anuncios`.
- `Contenidos / Anuncios` keeps configuration and libraries, but no duplicate activation switches.
- Monitor keeps its existing Lab.29 15 FPS / 5 FPS adaptive capture controller.
- LAN/NDI remain consumers of the Output master and are not given separate UI state authorities here.
- Profile changes rehydrate the same moved controls rather than creating new nodes.

## Regression risks and required protections
1. **Duplicate switches / divergent state:** move original DOM nodes; assert exactly one `#cannedEnabled` and one `#ecYoutubePromoEnabled`.
2. **Lost listeners after move:** do not replace those inputs or their parent switch rows; move with `appendChild`/`append` only.
3. **YouTube stale-save regression:** never save Promo state from the new UX module. Existing Lab.29 handler remains owner.
4. **Content setting stale save:** new UX module does not implement a second save path for `#cannedEnabled`.
5. **Queue render regression:** never rewrite `#queue` or redefine `renderQueue`; only move its existing `.queue-card`.
6. **Queue information loss:** keep renderer-0332 row markup and technical details untouched.
7. **Decorative queue icons:** no `.ec-auto-row-icon`, image/thumbnail injection, or per-row icon markup.
8. **Manual next-content regression:** manual content continues to appear as a PROGRAMADO queue item; no separate next-content card is created.
9. **Preparation controls duplicated:** move the existing `#processStart/#processPause/#processResume/#processStop` buttons to the queue header action host; keep one instance of each.
10. **Emission controls duplicated:** move the existing emission buttons into the right-side control card; keep one instance of each.
11. **Session counters duplicated:** move the existing `#sessionCounters` block from the queue card into the right column.
12. **Exclusive scheduling regression:** move `#exclusiveSchedule0324` only; do not modify scheduler state or frequency logic.
13. **Monitor freeze/double capture:** move `#ecLanMonitorCard` only; do not create a second monitor or capture timer.
14. **Responsive resize regression:** no resize observers/listeners that reparent DOM. Use CSS Grid and a single breakpoint.
15. **Profile switching:** the layout installer is idempotent and can run after `profile:changed` without duplicating wrappers or controls.
16. **Accessibility:** moved switches retain their labels; icon-only decoration is `aria-hidden` through CSS/pseudo-elements and buttons keep visible text.

## Responsive behavior
- Wide: two-column operator console, queue dominant on the left and monitor/current/control/session on the right.
- Narrow (around existing 1180 px stability breakpoint): columns stack using CSS only.
- Minimum supported control window remains 1100×720; no horizontal overflow should be introduced.

## Acceptance checks
- There is one and only one Content activation input and one Promo activation input.
- Both switches operate while staying synchronized with persisted settings after profile reload.
- Queue cards still show all current metadata and technical details, with no new row icons.
- Preparation buttons work from queue header.
- Manual content selection remains visible in queue as PROGRAMADO; no redundant `Próximo contenido` card exists.
- Monitor remains one instance and still runs at adaptive Lab.29 cadence.
- Session counters continue updating.
- Exclusive rule behavior remains untouched.
- Resize sequence 1500→1300→1181→1180→1100→1180→1500 does not duplicate or detach controls.
