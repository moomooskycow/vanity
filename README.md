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
- The page does not send browser-error telemetry. Production gate/deploy errors
  retain the existing narrow Sentry path described below.
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

Before merge, the credential-free CI gate runs `node scripts/deploy.mjs --preflight`.
This is the production entry point with only its inert-mode flag added: it
validates the shared DigitalOcean POST request against the documented provider
contract, archives the exact Git revision into a temporary static artifact,
serves repository-root files over loopback HTTP, and runs the production
byte-for-byte asset smoke. This matches the existing provider's root output
with no custom build; production verifies that private configuration before
mutation. Uncommitted files are not archived, and private generators never run.
Unsupported, stray, combined, or repeated CLI arguments fail before any provider
authentication or mutation. Production runs the same preflight before using
its credential. This does not claim provider-side build or delivery proof.

The artifact smoke covers five public files per domain (ten production byte
checks). The retired Canary observer, configuration/health handlers, standalone
telemetry service, and their environment consumption have been removed. There
are no browser config requests or ingest credentials. Historical secret inventory
and archived Allie evidence are not active configuration and are left untouched.

DigitalOcean has no inert deployment POST. Token permissions, the private live app
spec/Git-source configuration, current-master ownership, provider-side build,
ACTIVE deployment/source identity, and real delivery on both domains necessarily
remain trusted-main checks. Preflight does not regenerate Daybook's public quote
or Taste/wishlist projections; the existing repo gate retains those privacy
contracts. No new PR secrets or provider grants are required.

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

## CI

`./scripts/check.sh` is the canonical gate. GitHub Actions is a thin caller
around that script so local and hosted validation stay aligned.
