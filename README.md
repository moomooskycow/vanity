# vanity

Personal site for phaedrus.io: an oversized cobalt portrait, one short line,
three links, and an accessible quote chyron. Static HTML, CSS, and JavaScript;
no package manager or build step. Shared colors and controls come from
[`@misty-step/aesthetic`](https://github.com/misty-step/aesthetic), pinned to a
release tag; the approved poster layout and type scale are site-specific.

## Development

```bash
# Static preview
python3 -m http.server 4173        # or: open index.html

# Repo-owned CI gate (runs node --test)
./scripts/check.sh
```

## Conventions

- `index.html` owns the composition and light/dark toggle. The poster remains
  white on cobalt; the reading and quote bands follow the selected theme.
- `assets/portrait-dots.svg` is the original line-art portrait with a static
  Dots-style screen explored in [ASCII Magic](https://www.ascii-magic.com/app).
  There is no canvas renderer or animated image.
- `assets/og-image.png` is the 1200 by 630 social card from the poster.
- `quote-chyron.js` displays complete entries from the generated `quotes.js`
  pool, starting with Taleb's “Avoid boredom.” No Daybook research notes are
  included in the deployed site.
- Autoplay waits 20 seconds. Pause survives Next and temporary hover, focus,
  visibility, and motion-preference changes. Reduced motion keeps manual Next
  but disables autoplay; only manual changes are announced to screen readers.
- The `.quote-copy` reserve is 16rem, or 23rem below 375px. It covers all
  429 existing entries, including verse and attribution, at 320px and wider.
  After changing the generated pool, measure rendered height with loaded fonts;
  character count alone does not prove that the reserve fits.
- `canary-observer.js` and `api/` provide lightweight browser-error telemetry.
- Keep the surface to the portrait, approved personal line, three exits, and
  quotations. Allow natural vertical scrolling; avoid horizontal overflow.
- To upgrade the design system, bump the pinned tag in the jsdelivr
  `<link>`.
- `bio.md` and `explore/` are local draft material unless explicitly promoted.

## Deploy

Publication requires an operator-authorized task. The current DigitalOcean
App Platform target serves tracked static files from `master`; it uses a manual
Git-source deployment rather than a connected deploy-on-push integration.
Estate owns the provider binding and credentials. Verify the active source
revision and both public domains after a deployment; retain the prior deployment
for rollback.

The portable handlers in `api/` can also be served by `service/server.js`.
The static preview does not emulate those routes, and the observer must tolerate
an unavailable configuration endpoint without affecting the page.

## CI

`./scripts/check.sh` is the canonical gate. GitHub Actions is a thin caller
around that script so local and hosted validation stay aligned.
