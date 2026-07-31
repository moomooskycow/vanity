# AGENTS.md

This file provides guidance to Codex when working in this repository.

## Overview

Personal site for phaedrus.io. Static HTML, CSS, and vanilla JavaScript. There
is no build step and no package manager dependency.

The production surface is intentionally small: one full-viewport page with the
name row, three links, and a quote colophon. Do not add a bio page, project
grid, theme picker, or scrolling content here unless the operator explicitly
asks for a redesign. Project and studio content belongs on Misty Step.

## Development

```bash
# Static preview
python3 -m http.server 4173

# Aggregate local gate
./scripts/check.sh

# Focused structural tests
node --test
```

Direct `file://` opens are acceptable for a quick layout check, but use HTTP
for delivery QA so root-relative assets such as `/canary-observer.js` load
normally. `python3 -m http.server` does not emulate Vercel functions; API
handler behavior is covered by `node --test`, or by a Vercel-shaped local
server when browser QA must include `/api/*`.

## Architecture

- `index.html` - The page structure, site glue CSS, theme toggle, and quote
  typewriter runtime.
- `quotes.js` - Generated daybook quote pool consumed by the colophon.
- `canary-observer.js` - Browser error observer. It must never break the page
  it observes.
- `api/canary-config.js` - Vercel function that exposes only the public Canary
  ingest key.
- `api/health.js` - Vercel health function for Canary key configuration.
- `scripts/check.sh` - Host-agnostic local CI gate used by hooks and GitHub
  Actions.
- `test/*.test.js` - Node test-runner coverage for the API and observer
  contracts.

## Design Law

The design system is `@misty-step/aesthetic`, imported from the pinned jsdelivr
tag in `index.html`. Do not inline or fork the design system in this repo;
change the package, tag a release, and bump the CDN pin.

Rules for this site:

- The page remains one `.ae-screen`: everything fits the viewport on desktop
  and mobile. No page scrolling.
- Content stays tight: name row, link row, quote colophon. No generated copy
  about the design itself.
- The footer quote area reserves enough height for the longest quote in
  `quotes.js`. If the generated quote pool grows, adjust the `.q-foot`
  reserve and the matching docs together.
- Drafts and design explorations are local scratch by default. Keep `bio.md`
  and `explore/` out of the deployable Git surface unless explicitly promoted.

## Deploy

Push to `master`. Vercel serves the directory statically with the serverless
API functions declared by `vercel.json`.
