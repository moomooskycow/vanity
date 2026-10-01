# vanity

Personal site for phaedrus.io: an oversized cobalt portrait, one short line,
three links, and an accessible quote chyron. Static HTML, CSS, and JavaScript;
no site build step. A pinned Wrangler CLI owns publication. Shared colors and controls come from
[`@misty-step/aesthetic`](https://github.com/misty-step/aesthetic), pinned to a
release tag; the approved poster layout and type scale are site-specific.

## Development

```bash
# Static preview
npm ci --ignore-scripts --no-audit --no-fund  # pinned deployment tooling
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
Both public domains are existing Cloudflare Worker `vanity` custom domains.
The CI `production deploy and smoke` job publishes that actual Worker, verifies
its sole active version at 100% with the exact merged Git revision tag, and checks
the exact committed homepage, scripts, portrait, and social-card bytes on both
`https://phaedrus.io` and `https://www.phaedrus.io`. A failed gate, deployment, or
smoke emits a narrow error to the existing `misty-step/vanity` Sentry project,
whose enabled issue-stream workflows notify only `kaylee-alert-intake`.
The Actions run retains the Worker deployment/version, prior deployment, and hashes.

Before merge, the credential-free CI gate runs `node scripts/deploy.mjs --preflight`.
This materializes only the five approved public files from the exact Git revision
into a temporary artifact, invokes the actual pinned `wrangler deploy` command
with only `--dry-run` added, and runs the production byte-for-byte asset smoke
against the materialized files over loopback HTTP. Production runs that same
native dry-run before the same invocation without the flag. No alternative
publication request, fake provider API or credential is used in PR CI.
Uncommitted files, source/config, evidence, local drafts and private generators
are never uploaded. Unsupported, stray, combined, or repeated CLI arguments fail
before provider authentication or mutation. Native dry-run proves compilation
and packaging, not provider authorization, activation or public delivery.

The artifact smoke covers five public files per domain (ten production byte
checks). The retired Canary observer, configuration/health handlers, standalone
telemetry service, and their environment consumption have been removed. There
are no browser config requests or ingest credentials. Historical secret inventory
and archived Allie evidence are not active configuration and are left untouched.

Provider authentication, current-master ownership, the exact active Worker version
tag, and real delivery on both domains remain trusted-main checks. After upload,
delivery readiness is bounded to 60 seconds using unchanged URLs and exact-byte
expectations. Only the prior HTTP-200 bytes observed immediately before publication
may coexist temporarily with exact new bytes; any HTTP error, timeout or unknown
content fails immediately. Old bytes are never accepted as success: all ten
checks must match the new artifact before the job passes. There is no cache purge,
DNS change, cache-busting-only proof or generic retry.

Preflight does not regenerate Daybook's public quote or Taste/wishlist projections;
the existing repo gate retains those privacy contracts. No new PR secrets or
provider grants are required.

There is no separate routine publication approval. Normal review and green CI,
the approved generated public-data projection, and deliberate promotion of
private/local drafts remain boundaries. Deployment never opens Daybook or
regenerates catalogs; local uncommitted files are not published.

The deployment job uses repository secret `CLOUDFLARE_API_TOKEN`; `.env.pass`
references the existing native pass credential for authorized local operations.
The Sentry DSN is a public ingest key, not a bearer credential. Verify after merge:

```bash
gh run list --workflow ci.yml --branch master
GITHUB_SHA=<merged-sha> node scripts/deploy.mjs --smoke-only
```

Use `gh workflow run ci.yml --ref master -f alert_probe=true` for a safe deliberate
failure drill. It skips publication, fails the deployment job, and sends an
agent-only error tagged `alert_route_probe=yes`; production stays unchanged.
Confirm the error reaches Sentry and the Kaylee intake, not merely that sending
returned success.

The prior Worker deployment/version is retained for native version rollback.
For recovery, use Wrangler's version rollback on `vanity`, then run the smoke
command against the corresponding Git revision; do not weaken the byte checks.

The 2026-10-01 retirement release exposed a wrong-publication-target failure:
DigitalOcean app `b9e45cbb-9f2a-418e-ab91-dc5a2b157c25` became ACTIVE at
`2221265eaf6d19a58b7cd86f39a2df2af046dfb7`, but the public Worker still served its
September 20 static assets and Canary API code. This was not propagation delay.
Earlier public-byte matches did not prove a live DigitalOcean source revision.
The erroneous DigitalOcean publication caller is removed; the standing app is
preserved because its wider ownership is not established. Public content remains
the approved retirement artifact; this correction changes only its real publisher.

## CI

`./scripts/check.sh` is the canonical gate. GitHub Actions is a thin caller
around that script so local and hosted validation stay aligned.
