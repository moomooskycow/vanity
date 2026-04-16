# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal portfolio site. Pure HTML, CSS, and vanilla JavaScript. No build step, no runtime dependencies.

## Development

```bash
# Recommended: local server so projects.json can be fetched
npx serve .

# Quick layout-only check
open index.html
```

Direct `file://` opens are now partial-fidelity only: browsers block the
runtime `fetch('./projects.json')`, so the projects section shows a fallback
message unless you use HTTP.

## Architecture

Five files, single responsibility each:

- `index.html` — Single-page structure with semantic sections (hero, projects, positioning, contact)
- `styles.css` — Semantic design tokens plus theme-specific overrides for `editorial`, `contractor`, and `lattice`
- `script.js` — Theme resolution (`?theme=` then localStorage), theme-copy rendering, project rendering, reveal-on-scroll, scroll progress bar, lattice canvas animation
- `projects.json` — Project card data rendered into the grid at runtime
- `themes.json` — Theme-owned copy variants for hero, positioning, and contact

## Design System

CSS variables are defined in `:root` and overridden per theme with attribute selectors:

- `[data-theme="editorial"]`
- `[data-theme="contractor"]`
- `[data-theme="lattice"]`

The token layers are:

- Core surfaces and text: `--page-bg`, `--page-bg-alt`, `--surface`, `--surface-strong`, `--text`, `--muted`, `--accent`, `--accent-rgb`, `--border`
- Typography and layout: `--font-display`, `--font-body`, `--font-mono`, `--hero-title-size`, `--panel-radius`, `--button-radius`
- Lattice tokens (consumed by CSS and by `script.js` via `getComputedStyle`): `--grid-size-px`, `--node-radius`, `--node-color`, `--connection-radius`, `--lattice-line-alpha-max`, `--lattice-crosshair-alpha`, `--lattice-glow`, `--lattice-glow-alpha`

CSS is the single source of truth for visual constants. `script.js` reads lattice tokens at runtime, so canvas color and glow follow theme changes without hardcoded values.

## Deploy

Push to main. Static hosting (Vercel/Netlify/GitHub Pages) serves automatically.
