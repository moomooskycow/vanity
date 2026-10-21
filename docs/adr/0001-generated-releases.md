# Generated releases for the public site

Accepted: 2026-10-15.

One release unit: the public `vanity` Worker and its allowlisted static assets.
Use the [shared release convention](https://github.com/misty-step/harness/blob/master/docs/release-convention.md)
and [Foundations](https://foundations.mistystep.io/), not a second local policy.

No previous tags or GitHub Releases exist. Adopt release-please's Node strategy
at baseline `16505f9d2698c2b6a7191df1827eade8633a8b90`, with initial manifest
and package version `0.0.0`. These are bootstrap state, not a published release.
Use the generator's default first release, `1.0.0`; do not publish historical
personal-site commit messages as retrospective notes.

The generated `CHANGELOG.md` is canonical. The existing exact-revision artifact
materializer renders it into static `/changelog` beside its generated version
and full source SHA. It uploads no new source, draft, private record or generator
input. The homepage's small footer link leaves the three personal exits intact.
The shipped page needs no GitHub token, API, new runtime or dependency.

Keep the existing repo gate, native dry-run, sole production deploy path,
current-master check, active-provider identity readback, both-domain exact-byte
smoke and Sentry agent intake. The same serialized CI run publishes metadata
only after those gates succeed. Native approval starts only the release bot's
current same-repository PR's configured CI and Allie workflows; neither dispatch
checks nor passing stand-ins are used.

Code rollback uses Cloudflare's retained Worker versions and their associated
static assets, followed by exact source smoke. It never restores data. There is
no state store or migration in this release unit. A disposable Worker recovery
drill is operator evidence, not a new scheduled gate or production restore.

`SPEC.md` is absent at adoption. `VISION.md` and the README currently describe
the accepted page behavior; their observable stories are sampled rather than
inventing a new product contract in release automation.


## 2026-10-21 amendment: tested forward publication

Issue #143 replaces the publication-only current-master equality check with
exact native gate provenance, authorized trunk membership and ancestry from the
actual live source. A tested B may publish after trunk reaches untested C; a
newer native-tested descendant, including one whose deployment failed or whose
exact source passed PR checks before entering trunk, supersedes B. A tested
merged branch absent from B also blocks B rather than guessing between
incomparable builds. Equal live source is verified idempotently, older source skips, and divergent
or unproven source is refused. A fresh provider deployment/version read immediately
before native publication aborts an observed concurrent change. Existing native
workflow serialization, exact source readback and both-domain delivery remain.

The release metadata generator's head check remains: release-please reads the
current default branch, so an older tested publication must not generate metadata
from unverified newer trunk. The deploy job exports a verified SHA only after
exact delivery and final identity readback (or verification of equal live source),
and the metadata job requires that SHA to match its source.

This is forward-publication policy, separate from #142's blocked automatic
recovery and independent-writer atomicity decision. No rollback implementation,
new controller, provider permission or browser telemetry is introduced here.
