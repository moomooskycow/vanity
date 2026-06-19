# vanity

Personal site for phaedrus.io: one full-viewport screen, no scrolling.
Name, three links, and a quote colophon. The design system is
[`@misty-step/aesthetic`](https://github.com/misty-step/aesthetic),
imported from the CDN pinned to a release tag.

## Development

```bash
# Static preview
python3 -m http.server 4173

# Host-agnostic repository gate
./scripts/ci.sh

# Coverage report artifacts
./scripts/ci.sh coverage
```

The gate runs JavaScript syntax checks, `vercel.json` parsing, Node's built-in
test runner, and a local `gitleaks` scan when the CLI is installed. GitHub
Actions delegates to the same script and uploads V8 coverage artifacts from the
coverage mode.

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

Push to `master`. Vercel serves the directory statically with the API functions
declared by `vercel.json`.
