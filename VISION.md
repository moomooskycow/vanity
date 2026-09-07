# vanity Vision

Status: Canonical root vision for `phaedrus.io`. Revise only when the personal
site intentionally changes from pointer page to a different product surface.

## What vanity Is

`vanity` is the personal site for `phaedrus.io`: one full-viewport screen with a
name, three links, and a quote colophon. It exists to be a clean pointer, not a
portfolio, archive, blog, or studio site.

The page should give a visitor enough orientation to continue elsewhere and
then get out of the way. Its restraint is the product. Misty Step carries the
company and project portfolio; Daybook carries private notes; local drafts stay
local until deliberately promoted.

## North Star

A tiny page with discipline: no scrolling, no decoration creep, no explanatory
sprawl, one accent instance, and a quote colophon that feels alive without
becoming the reason the site exists.

## What Must Stay True

- `index.html` owns the deployed page. `quotes.js` is generated from the
  Daybook quote pool; regenerating it does not authorize reading or publishing
  unrelated private Daybook material.
- `canary-observer.js` and `api/` provide lightweight telemetry and must never
  make the static page fragile.
- Reserve enough quote space to avoid layout shift as the generated pool
  changes.
- The design system is `@misty-step/aesthetic`, imported from the pinned CDN
  release tag. Change the package and tag, then bump the pin.
- Delivery QA uses HTTP when root-relative assets or API routes matter;
  `file://` is layout-only.

## What vanity Refuses

- Page scrolling.
- New font sizes, decorative extras, theme sprawl, or a project grid.
- Bio, archive, reading list, or explore surfaces unless the operator
  explicitly promotes them into the deployed product.
- Package-manager or build-step complexity for a page that should remain static.
- Telemetry becoming more important than the page it observes.

