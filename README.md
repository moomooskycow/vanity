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
- Autoplay waits 20 seconds, then walks the generated pool in order. A hidden
  tab pauses and restarts a full reading interval. There are no Pause or Next
  controls; reduced motion does not freeze the pool.
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

Reviewed merges to `master` publish automatically after the repo-owned gate.
The CI `production deploy and smoke` job redeploys the existing DigitalOcean
App Platform Git-source target, verifies its active source revision, and checks
the exact committed homepage, scripts, portrait, and social-card bytes on both
`https://phaedrus.io` and `https://www.phaedrus.io`. A failed gate, deployment, or
smoke emits a narrow error to the existing `misty-step/vanity` Sentry project,
whose enabled issue-stream workflows notify only `kaylee-alert-intake`.
The Actions run retains the deployment ID, prior deployment ID, and smoke hashes.

There is no separate routine publication approval. Normal review and green CI,
the approved generated public-data projection, and deliberate promotion of
private/local drafts remain boundaries. Deployment never opens Daybook or
regenerates catalogs; local uncommitted files are not published.

Estate owns the existing provider placement. The deployment job uses the
repository secret `DIGITALOCEAN_API_TOKEN`; `.env.pass` references its existing
pass credential for authorized local operations. The Sentry DSN is a public
ingest key, not a bearer credential. Verify the deployment run after merge:

```bash
gh run list --workflow ci.yml --branch master
GITHUB_SHA=<merged-sha> node scripts/deploy.mjs --smoke-only
```

Use `gh workflow run ci.yml --ref master -f alert_probe=true` for a safe deliberate
failure drill. It skips publication, fails the deployment job, and sends an
agent-only error tagged `alert_route_probe=yes`; production stays unchanged.
Confirm the error reaches Sentry and the Kaylee intake, not merely that sending
returned success.

The deployment summary retains the prior deployment for rollback. For recovery,
use the existing App Platform rollback API/CLI to restore that known-good
deployment, then run the smoke command with its source revision. Keep
`skip_pin=true` so a recovery does not disable future merged-source deployments.

The portable handlers in `api/` can also be served by `service/server.js`.
The static preview does not emulate those routes, and the observer must tolerate
an unavailable configuration endpoint without affecting the page.

## CI

`./scripts/check.sh` is the canonical gate. GitHub Actions is a thin caller
around that script so local and hosted validation stay aligned.
