# Manual next-content card fix

## Goal
When a user selects a specific video with **Programar como próximo**, the existing **Próximo contenido / selección** card must immediately show that manual selection even if news emission is stopped or Contenidos is disabled.

## Behaviour
- Manual selection has visual priority over adaptive/automatic selection.
- The exact selected filename and duration are shown.
- If Contenidos is disabled, the card warns that the content will wait until Contenidos is enabled.
- The card exposes **Cancelar próximo** and reuses the existing specific-cancel action.
- Cancelling returns the card to adaptive selection if one exists, otherwise to normal random selection.
- Replacing content A with B updates the same card without duplicating queue state.
- Backend scheduling semantics are unchanged; this is a state-exposure/UI consistency fix.

## Verification
1. RED test in `scripts/check-v2lab-manual-content-selection.js`.
2. Include it in `check-v2lab-stabilization-lab28.js`.
3. Fix backend snapshot exposure only if `canned.manualContent` is not already present.
4. Fix renderer priority and cancellation UI.
5. Run static diagnostics and Windows portable workflow before declaring the build ready.
