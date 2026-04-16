# Theme system (Editorial / Contractor / Lattice) + Agent Architect positioning

Priority: high
Status: ready
Blocked-by: 003-projects-data-driven
Estimate: L

## Goal
Replace the current dark/light toggle with a three-theme system (Editorial, Contractor, Lattice) where each theme changes *both* visuals and copy — making the site a live demonstration of design-system capability and a flexible landing page for ad-driven A/B variants. Core positioning: **Agent Architect** — independent systems engineering, agents and the tools to build agents.

## Non-Goals
- A theme editor UI, live-preview color picker, or custom-theme creation. Three curated themes only.
- Dark-mode-per-theme (6 variants). Each theme is one curated palette; light/dark is a property of the theme itself.
- CMS or per-visitor personalization. Theme is user-chosen or query-param driven; defaults to Lattice (or whichever we decide).
- A11y overrides (prefers-reduced-motion handling is already in place; keep it, don't expand).
- Decoupling copy from theme for now. Each theme owns its copy variant; revisit later if ad-testing demands orthogonal control.

## Oracle
- [ ] Three themes exist as `[data-theme="editorial"]`, `[data-theme="contractor"]`, `[data-theme="lattice"]` attribute selectors in `styles.css`. Each theme is visually distinct on first glance — different type scale, palette, and at least one distinctive element (stamp, lattice accent, editorial pull-quote treatment, etc.).
- [ ] Each theme has its own hero + services/positioning copy variant, loaded from a `themes.json` (or inlined) alongside the projects data. Copy is not generic — each variant expresses a different facet of the Agent Architect positioning.
- [ ] Theme toggle UI in the nav (cycle button, segmented control, or picker — implementer's call). Theme persists to `localStorage`.
- [ ] `?theme=editorial` (or `contractor`, `lattice`) query param forces that theme on load, overriding localStorage. Enables direct-linking from ads.
- [ ] Invalid or missing `?theme=` value falls back to saved preference, then to default.
- [ ] Page title or meta stays stable across themes (don't churn SEO).
- [ ] The existing dark/light `theme-toggle` button is removed — replaced, not augmented.
- [ ] Lattice canvas recolors correctly under each theme (depends on item 002 — JS reading tokens, not hardcoding).
- [ ] All three themes pass WCAG AA contrast for body text + accent.

## Notes

### Positioning spine (shared across all three variants)
- **Core thesis**: "I build agents, the tools to build agents, and the tools to build the tools."
- **Phrases that land** (from brainstorm): *independent systems engineering*, *rapid prototyping*.
- **Phrases that don't**: "for teams that refuse to be slow" (cut). Consultant-boilerplate services cards (kill the four-card grid entirely).
- **Anti-pattern reference**: the Daybook "Never Say" list bans LLM-default voice (compliment sandwiches, "let's unpack this," hedging). Copy should sound like Phaedrus, not ChatGPT.

### Theme descriptors (starting point — iterate during build)

**Editorial** — *classical reader / memoirist facet*
- Typography: Cormorant Garamond display + Crimson Pro body (current direction, refined).
- Palette: warm parchment, black ink, muted accent.
- Copy register: longer sentences, literary, first-person. Service section reframed as "Notes" or "Practice."
- Draft hero: *"Phaedrus — independent systems engineering. I build agents, and the tools to build agents, and the tools to build the tools."*

**Contractor** — *Cold War systems / defense-contractor facet*
- Typography: grotesk + monospace (e.g., Inter + JetBrains Mono, or a slab). Stamp-style caps.
- Palette: institutional navy + bone paper + red-orange stamp. Grid-forward layout.
- Copy register: terse, formal, numbered. Service section reframed as "Capabilities" in departmental taxonomy.
- Draft hero: *"PHAEDRUS / DEPT. OF AUTONOMOUS SYSTEMS / Independent engineering. Agents, tooling, infrastructure. Rapid prototyping on request."*

**Lattice** — *agent/systems architect facet*
- Typography: neutral sans + monospace accents (e.g., Inter + IBM Plex Mono).
- Palette: dark canvas, signal green or coral accent, lattice visual everywhere.
- Copy register: compressed, technical, schematic. Service section reframed as capability tags or a mini-spec block.
- Draft hero: *"I build agents and their infrastructure. Independent systems engineering. Rapid prototyping."*

### Implementation order (suggested)
1. Land item 002 (real tokens) and item 003 (projects data) first — prerequisites.
2. Inventory every visual token in current `styles.css`; sort semantic vs. literal.
3. Rename to semantic tokens (`--color-bg`, `--color-text`, `--color-accent`, `--font-display`, `--font-body`, `--type-scale-xl`, etc.) — so theme switching = token swap, not rule rewrite.
4. Build Editorial first (closest to current) to validate the token set. Then Contractor (most different — exposes missing tokens). Then Lattice.
5. Wire toggle + query param + localStorage last (low-risk plumbing).

### Open questions to resolve in-flight
- Default theme on first visit? (Lattice feels right given positioning; Editorial is safest.)
- Toggle affordance shape: cycle button with label, or three-dot segmented selector? Lean segmented — three themes feels like a *choice*, not a mode.
- Does theme leak into OG/Twitter card preview? Likely no — too complex; one canonical OG image.
- Does the projects grid reorder per theme, or only restyle? Start with restyle only; reorder via `emphasis` field later if needed.

This is the demonstration piece — if the site *looks* like three sites but *is* one CSS file flipping tokens, it proves the design system works and doubles as a portfolio artifact in its own right.
