# vanity

Personal site for phaedrus.io: one full-viewport screen, no scrolling.
Name, three links, and a quote colophon. The design system is
[`@misty-step/aesthetic`](https://github.com/misty-step/aesthetic),
imported from the CDN pinned to a release tag.

## Development

```bash
# Static preview
python3 -m http.server 4173        # or: open index.html

# Repo-owned CI gate (runs node --test)
./scripts/check.sh
```

## Conventions

- `index.html` owns the page structure, site glue CSS, light/dark toggle, and
  quote typewriter.
- `quotes.js` is the generated daybook quote pool for the footer colophon.
- `canary-observer.js` and `api/` provide lightweight browser-error telemetry.
- Stay inside the system: one accent instance (the misty step link), no
  page scrolling, no new font sizes, no decoration.
- To upgrade the design system, bump the pinned tag in the jsdelivr
  `<link>`.
- `bio.md` and `explore/` are local draft material unless explicitly promoted.

## Deploy

Publication requires an operator-authorized task. DigitalOcean serves the
static directory and the Node sidecar in `service/`.

## CI

`./scripts/check.sh` is the canonical gate. GitHub Actions is a thin caller
around that script so local and hosted validation stay aligned.
