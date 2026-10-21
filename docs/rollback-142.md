# Rollback remediation #142 — draft

Issue: https://github.com/moomooskycow/vanity/issues/142

## Observable outcome

When candidate B activates and fails exact public delivery checks, restore the
previous compatible version A only while B owns the active deployment. Verify A's
native deployment/version/source identity and every prior critical public asset
on both domains. Keep the publication job failed, even after verified recovery,
so the existing narrow Sentry alert links operators to the run diagnostics.

Before publication, require one prior version at 100%, a full available source
revision, unchanged Worker/configuration source, assets-only provider bindings,
and exact prior delivery. Unproven prior identity, source, compatibility, or health
fails before publication. Unproven candidate identity permits no recovery write.
Native compatibility errors are never overridden with `force`.

Recovery makes one native deployment POST and never retries that mutation. Reads
have 30-second request timeouts; exact delivery has a 60-second total deadline.
The publisher has a 120-second process timeout. A missing response, identity
mismatch, supersession, HTTP error, unknown bytes, or timeout is not recovery
success. CI continues its existing error path; no browser telemetry or new
control plane is introduced.

## Merge blocker: ownership is not atomic

The [native deployment API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/)
documents percentage/version activation and optional force, but no conditional
expected-current-deployment field. The pinned Wrangler 4.145.0 implementation
also performs an unconditional POST for rollback.

The draft rechecks deployment ID and sole version immediately before POST. This
protects C arriving before that read. It cannot protect C arriving between the
read and the write. Existing Actions concurrency serializes pipeline runs, but
cannot serialize a local Wrangler or provider operator. Do not describe that
check as atomic, weaken the requirement, enable the draft, or merge it without
resolving this boundary. The explicit `concurrent-after-check` TODO regression
fails its no-overwrite expectation and keeps this gap visible. Other passing
checks do not satisfy this acceptance criterion.

Issue #143 remains separate. This work does not repair generated release
promotion/source-equals-master behavior.

## Source evidence

The recovery test calls the real exported deploy entry point, child publisher
process, native HTTP API request/response boundary, committed Git artifacts, and
both-domain byte verifier. Only provider boundaries are controlled locally.
This is source evidence, not a live Cloudflare rollback.

Scenarios cover postactivation 503 and unknown bytes, normal publication,
supersession before recovery, rejected rollback, bad restored delivery,
unproven stateful compatibility, a publisher exiting after activation,
publication plus readback failure, summary-write failure, and the unresolved
read/write race. Test Git origin is an isolated bare fixture pinned to the tested
revision, so committed and detached CI checkouts run the same assertions.

The base comparison uses the unchanged baseline deploy implementation with only
its existing `deploy` function exported for the test. It must fail the 503 and
unknown-byte restoration expectations. No test-only recovery logic is added to
that baseline.

## Live status

Read-only Cloudflare verification on 2026-10-21 found production unchanged:

- Git source: `69875a6fe8b1ffeaa3322eb05e01039a3324bba9`.
- Deployment: `781e9c69-9adb-478b-affc-a18c1de67d44`.
- Version: `2795aa62-4e43-4121-8259-b7fc6f9c21e9` at 100%.
- Provider bindings: only `ASSETS` of type `assets`.

Existing `vanity-staging` was discovered read-only (workers.dev enabled;
preview URLs disabled). Its deployment is
`88e973ee-a3b0-4600-be0d-48eb298a41c3`, version
`d9623d22-341a-4e74-87d5-031797303ae7` at 100%.
Neither target was mutated. Native disposable-target recovery rehearsal remains
pending the ownership design; normal production rollout is blocked by that same
review gate. No production recovery, provider rehearsal, merge, or deployment
of this draft is claimed. Keep #142 open.
