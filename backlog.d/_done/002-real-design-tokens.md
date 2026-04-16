# Real design tokens — CSS as single source of truth

Priority: high
Status: shipped
Estimate: S

## Goal
Make CSS custom properties the *actual* source of truth for all visual constants. JavaScript reads tokens at runtime via `getComputedStyle` instead of duplicating literal values.

## Non-Goals
- Introducing a build step, Sass, PostCSS, Tailwind, or any tooling. Pure CSS + vanilla JS only.
- Renaming tokens yet — just wiring what exists. Semantic token naming comes with item 004.
- Refactoring layout, typography, or spacing. Colors + canvas constants only in this pass.

## Oracle
- [ ] `script.js` contains zero hardcoded color literals (no `rgba(232, 90, 79, …)`, no hex colors). Grep confirms: `grep -E "rgba?\(|#[0-9a-fA-F]{3,6}" script.js` returns nothing.
- [ ] Lattice canvas (hero + contact) reads accent color, line color, and connection radius from CSS custom properties declared on `:root`.
- [ ] Changing `--accent` in `styles.css` alone changes the lattice color on reload — no JS edit required. Verified manually.
- [ ] The four grid-background implementations (`.grid-bg`, `.featured::before`, `.project::before`, `#services::before`) consolidate to one source: either one reusable CSS class or one mixin-style custom-property pattern. Grid cell size is a single token.
- [ ] Orphan `.grid-bg` class is either wired up or deleted — no dead rules.
- [ ] `--connection-radius` in CSS matches the value script.js uses (currently declared 250, script hardcodes 200 — pick one and enforce via CSS).

## Notes
Investigation findings (2026-04-15):
- `script.js:115, 147, 159` hardcode `rgba(232, 90, 79, …)` with opacities (0.4, 0.25, 0.3) that don't match CSS opacities (0.5, 0.7).
- `script.js:22` reads `this.connectionRadius = 200`; `styles.css:28` declares `--connection-radius: 250`. Declared-but-unused variable = broken contract.
- Grid pattern appears 4 places: `styles.css:96–100` (`.grid-bg`, unused), `:386` (`.featured::before`, 50px hardcoded), `:477` (`.project::before`, 30px hardcoded), `:554` (`#services::before`, 100px via vars).

Pattern to use in JS:
```js
const root = getComputedStyle(document.documentElement);
const accent = root.getPropertyValue('--accent').trim();
```

Prereq for item 004 (theme system) — themes flip CSS vars; if JS hardcodes colors the themes won't actually theme the canvas.

## What Was Built
- Shipped on `master` in commit `5a6a49f` on 2026-04-16.
- `script.js` now reads lattice runtime tokens from CSS via `getComputedStyle`, including `--connection-radius`, `--node-color`, and accent-derived alpha controls.
- `styles.css` now owns the lattice token set, including reconciled `--connection-radius: 200` and shared grid-background rules for `.featured::before`, `.project::before`, `#services::before`, and `.grid-bg`.
- Recent commit evidence already states this item as delivered, so this file is archived to keep `flywheel pick` from selecting stale work.
