# Specwright design handoff (v1, awaiting approval)

Canvas: https://claude.ai/artifact/28oLWuXgufS4i1bR3Y3Hja
Local copy: `design/canvas/project/` (the canvas's own files).

## Purpose
Turn a client brief into a store they own, on any platform, verified before it ships.

## Signature
**Lock-on.** Every rendered element carries `data-spec-id`. Selecting a spec id anywhere
(spec tree, build check, client comment) draws four corner brackets on that element
(`.sw-brackets.sw-lock`) and raises its spec tag (`.sw-tag.sw-locktag.sw-rise`).
The mark is the same brackets around a Draft Blue square.

## Tokens
`design/canvas/project/tokens.css` is the source. It ships as `packages/ui/src/tokens.css` with the same names.
- Color: `--sw-*` semantic set, light on `.sw`, dark on `.sw.dark`. One accent, Draft Blue `#1F4FD8` / `#7D97FF`.
- Type: Geist (UI), Geist Mono (spec ids, code, report numbers). Scale 12 to 48.
- Space 4px base (`--sw-space-1..8`), radius 4/6/10/14, two shadows.
- Motion: 120/200/320 ms; standard, exit and spring easings; 40 ms stagger. Transform and opacity only.
  Reduced motion removes scale, rise, spin and pulse.

## Components (names match code)
`sw-btn` (primary, secondary, ghost, icon) · `sw-seg` · `sw-field`/`sw-input` · `sw-card` ·
`sw-tag` (spec id) · `sw-status` (pass, warn, fail, run, idle; dot plus text) · `sw-label` (triage, `is-quote`) ·
`sw-pin` · `sw-brackets` · `sw-tree` · `sw-tabs` · `sw-nav` · `sw-row` (project list).

## Screens
1. Foundations (`Main.dc.html`)
2. Projects (`Projects.dc.html`), with an `empty` state switch
3. Project Spec (`Spec.dc.html`): spec tree, reference render, inspector, per-platform targets
4. Build run (`Build.dc.html`): pipeline, checks, auto-fix in progress, failing element, CLI parity
5. Client review (`Review.dc.html`): white-label, pins, threads, scope flag, approve
6. Reference render of a sample client (`StorePreview.dc.html`): `hf-*` tokens in `store.css`,
   container queries so it reflows in any pane

## Notes for build
- Desktop hit targets are 36 px; `pointer: coarse` raises controls to 44 px.
- Comment pins anchor to `data-spec-id`, not coordinates.
- The client store's tokens (`hf-*`) are separate from Specwright's (`sw-*`). Generated themes never load `sw-*`.
