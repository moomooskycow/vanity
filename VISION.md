# vanity Vision

Status: Canonical root vision for `phaedrus.io`. Revise only when the personal
site intentionally changes from pointer page to a different product surface.

## What vanity Is

`vanity` is the personal site for `phaedrus.io`: a cobalt portrait poster, a
short personal line, three links, and a quote chyron. It exists to be a clean
pointer, not a portfolio, archive, blog, or studio site.

The page should give a visitor enough orientation to continue elsewhere and
then get out of the way. Its restraint is the product. Misty Step carries the
company and project portfolio; Daybook carries private notes; local drafts stay
local until deliberately promoted.

## North Star

A small page with a recognizable personal presence: expressive artwork,
readable type, a few useful exits, and quotations that can be read at rest.
Natural scrolling is preferable to shrinking or clipping the content.

## What Must Stay True

- `index.html` owns the deployed composition and theme control;
  `quote-chyron.js` owns quote interaction and autoplay. `quotes.js` is
  generated from the Daybook quote pool; regenerating it does not authorize
  reading or publishing unrelated private Daybook material.
- `canary-observer.js` and `api/` provide lightweight telemetry and must never
  make the static page fragile.
- Reserve enough quote space, including verse and attribution, to avoid layout
  shift. User pause, reduced motion, and interrupted reading take precedence
  over automatic rotation. No typewriter or scrolling marquee.
- The design system is `@misty-step/aesthetic`, imported from the pinned CDN
  release tag. Change the package and tag, then bump the pin.
- Delivery QA uses HTTP when root-relative assets or API routes matter;
  `file://` is layout-only.

## What vanity Refuses

- Horizontal overflow, clipped essential content, and decorative motion.
- Theme sprawl or a project grid.
- Bio, archive, reading list, or explore surfaces unless the operator
  explicitly promotes them into the deployed product.
- Package-manager or build-step complexity for a page that should remain static.
- Telemetry becoming more important than the page it observes.
