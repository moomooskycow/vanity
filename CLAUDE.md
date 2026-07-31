# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal site for phaedrus.io. One full-viewport screen, no scrolling. The
runtime surface is `index.html`, the generated quote pool in `quotes.js`, and
the lightweight Canary observer in `canary-observer.js` plus `api/`.

## Design Law

The design system is [`@misty-step/aesthetic`](https://github.com/misty-step/aesthetic),
imported via jsdelivr pinned to a release tag in `index.html`. Never inline
or fork its styles here; change the package, tag a release, bump the pin.

Rules for this site:

- The page is one `.ae-screen`: everything fits the viewport, desktop and
  mobile. No scrolling.
- Content stays tight: the name row (PHAEDRUS + the mode toggle), one
  link row, and the colophon. There is no bio (the operator writes any
  future copy himself). Do not grow a projects list here; that lives on
  misty step.
- The link row is one species: 13px chrome register, lowercase words,
  Lucide icons leading (briefcase for misty step, github, mail). Email
  is phraznikov@gmail.com.
- The footer is the colophon: a typewriter cycling through the quotes
  collection (`quotes.js`, generated from the daybook). The `.q-foot`
  min-height reserves space for the longest quote in the pool (~250
  chars) so typing never moves the stage; if a longer quote lands, bump
  that reserve. The attribution sits on its own line; reduced motion
  gets a full quote at rest. No copyright line.
- One font size; hierarchy via the registers (`.ae-name`, `.ae-lede`,
  `.ae-dim`). Motion only as the kit's built-in feedback plus the
  colophon typewriter.
- Left-aligned everything. No meta copy about the design itself. No
  fabricated claims, no em-dashes.
- `bio.md` and `explore/` are local draft material. Do not publish or promote
  them without an explicit operator request.

## Development

```bash
# Static preview
python3 -m http.server 4173

# Aggregate local gate
./scripts/check.sh

# Focused structural tests
node --test
```

## Deploy

Push to master. Vercel serves the directory statically (`vercel.json`).
