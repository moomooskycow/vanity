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

## Exact candidate identity

A SHA tag proves source, not invocation ownership. The draft now generates one
random publication-attempt message before native preflight and sends the same
arguments to production. It captures pinned Wrangler's structured receipt in a
new private temporary directory. Exactly one `deploy` v1 receipt must name
`vanity` and contain a full version UUID. Active readback must match that UUID
and the attempt message before its deployment ID is recorded for recovery.
Recovery compares that exact deployment ID and version again. Delivery success
also requires a final identity readback. Source tags remain a separate mandatory
verification, not a substitute for these identities.

Missing, malformed, ambiguous, wrong-target, or unsupported receipts abort
recovery. If Wrangler activates and then fails before writing its receipt, the
publication failure remains loud and no recovery write is authorized. This is
intentional fail-closed behavior, not proof that publication did not happen.

## Provider contract and remaining blocker

Checked 2026-10-21 against current official API documentation and SDK, plus the
repository's pinned Wrangler 4.145.0 source:

| Primary source | Relevant contract |
| --- | --- |
| [Create Worker deployment](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/) | The write selects target version percentages and optional annotations; no expected-current-deployment parameter is documented. `force` concerns compatibility overrides, not ownership. |
| [Current official generated SDK](https://github.com/cloudflare/cloudflare-typescript/blob/main/src/resources/workers/scripts/deployments.ts#L228) | Its create parameters mirror that contract; no typed ownership precondition is exposed. |
| [Pinned native deployment implementation](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.145.0/packages/deploy-helpers/src/deploy/helpers/versions-api.ts#L123) and [current implementation](https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/helpers/versions-api.ts#L123) | Both send an unconditional POST. Neither supplies an ownership header or expected deployment ID. |
| [Pinned native rollback implementation](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.145.0/packages/wrangler/src/versions/rollback/index.ts#L97) | Rollback calls that same native creation primitive. It does not provide an independent conditional-restore operation. |
| [Pinned structured-output contract](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.145.0/packages/workers-utils/src/output.ts#L99) and [publisher](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.145.0/packages/deploy-helpers/src/deploy/deploy.ts#L139) | Native output identifies the published version after the publisher returns. It is useful for exact version ownership; it is not a write fence. |
| [GitHub concurrency semantics](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) | The repository lock serializes participating workflow/job runs sharing the group. It does not lock Cloudflare's account or independent writers. |

No undocumented CAS header was invented, no native mutation probe was performed,
and no claim is made about unsupported server behavior. The blocker is the
supported provider contract available to this program: it cannot express
"activate A only if the current deployment is still B."

The unchanged hard regression exercises two histories with identical observations
through the last ownership GET:

1. B remains current; restoring A is required after B's failed verification.
2. C becomes current after that GET but before the POST; restoring A is forbidden.

The request in both histories selects A and contains no expected-B precondition.
The documented operation cannot distinguish the caller's conditional intent.
More GETs move the last unprotected interval; a readback after POST discovers an
overwrite only after it happened. Restoring C afterward would itself be another
unconditional write and could overwrite D. That is not a safe repair.

## Existing-pipeline alternatives and decision

Repository search finds one configured production caller: the `deploy` job in
[ci.yml](../.github/workflows/ci.yml). Workflow-level group
`ci-CI-refs/heads/master` spans check, publish, recovery, release and alert for
master push/dispatch runs. `cancel-in-progress` is false for those runs, so the
next participating publisher waits. PR runs use distinct refs and cannot enter
the production job. The existing current-master check rejects an already stale
source before publication. There is no need to add or rename the lock.

| Option using existing mechanisms | What it proves | Residual gap |
| --- | --- | --- |
| Keep the existing workflow lock | Ordinary participating CI publications do not overlap, including rollback. | It does not exclude local Wrangler, dashboard, other workflows, or other provider clients. Repository credentials for authorized local operations already exist. |
| Add another master/provider/Actions read or local abort check | Detects a supersession that has already become observable before that read. | C can arrive immediately after it; the adversarial regression still fails. |
| Route every publisher through the existing locked workflow and abort automatic recovery outside it | Gives cooperative writers one existing serialization boundary without a new control plane. | This requires an explicit operational exclusivity decision and evidence for every writer. Environment checks do not enforce Cloudflare permissions; manual cancellation and ambiguous in-flight writes also require a policy. It is not an unconditional account-wide ownership guarantee. |
| Abort recovery whenever exclusive ownership cannot be proven | Preserves a concurrent C by making no restoration write. | Also leaves a failed B in place when B is still current; it does not fulfill the requested automatic-restoration story. |
| Use a provider-supported conditional write/fence | Can enforce the original no-overwrite requirement at the write boundary. | No such primitive was found in the current supported deployment/rollback contract. |

Under the requested strict guarantee, there is no safe local choice between
required restoration and forbidden overwrite for those indistinguishable
histories. Do not remove, weaken, or mark the regression TODO. The outstanding
decision is whether to retain that strict guarantee and obtain a supported native
provider primitive, or explicitly adopt and verify a narrower all-writers-use-CI
contract. The latter changes the acceptance boundary and is not assumed here.
No permission, credential, or control-plane changes have been made.

Issue #143 remains separate. None of this changes generated-release promotion or
source-equals-master behavior.

## Source evidence

The recovery test calls the real exported deploy entry point, child publisher
process, native HTTP API request/response boundary, committed Git artifacts, and
both-domain byte verifier. Only provider boundaries are controlled locally.
This is source evidence, not a live Cloudflare rollback.

Scenarios additionally cover absent, ambiguous and wrong-target native receipts,
concurrent same-SHA and same-version publishers before first readback, and
supersession during otherwise successful delivery. Scenarios cover postactivation 503 and unknown bytes, normal publication,
supersession before recovery, rejected rollback, bad restored delivery,
unproven stateful compatibility, a publisher exiting after activation,
publication plus readback failure, summary-write failure, and the unresolved
read/write race. Test Git origin is an isolated bare fixture pinned to the tested
revision, so committed and detached CI checkouts run the same assertions.

The base comparison uses the unchanged baseline deploy implementation with only
its existing `deploy` function exported for the test. It must fail the 503 and
unknown-byte restoration expectations. No test-only recovery logic is added to
that baseline.

The initial local canonical gate had 32 pass and one expected failing TODO;
the independent reviewer reproduced the recovery suite with ten passing scenarios
plus that TODO. The unresolved ownership regression is now a hard failure so a
green gate cannot hide this missing acceptance criterion. The initial native CI
run [39542547045](https://github.com/moomooskycow/vanity/actions/runs/39542547045)
also exposed a Git URL portability error (checkout origin omits `.git`). The
fixture now reads the actual origin URL and permits only the local file protocol.
Native Wrangler dry-run plus six-file artifact HTTP preflight passed at
`3cc1e7fa02a59415387e318e0117ea5b0160df4e`.

The continued local canonical gate passes 37 tests and fails only the unchanged
`concurrent-after-check` assertion and its parent (2 failures, no TODO). The
receipt, same-SHA, same-version, and final-delivery identity scenarios pass.
Independent review reproduced 15 passing receipt/ownership scenarios with only
the provider race failing, and verified invocation parity by inspection. A real
credential-free pinned native dry-run emitted the expected `deploy` v1 receipt
for `vanity` with a null version ID (as expected without publication); its
six-file HTTP artifact preflight also passed. This validates native receipt
format locally, not live publication/recovery.

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
Neither target was mutated. A real read-only production smoke at the baseline
source passed all twelve exact public asset checks across both public domains. Native disposable-target recovery rehearsal remains
pending the ownership design; normal production rollout is blocked by that same
review gate. No production recovery, provider rehearsal, merge, or deployment
of this draft is claimed. Keep #142 open.

## Practical single-writer option — proposed, not configured

Use the existing GitHub Actions pipeline as the only supported writer. Keep its
master concurrency group across the entire publication/recovery operation with
cancellation disabled. A reviewed emergency `workflow_dispatch` mode would run
native rollback to an explicit retained version under that same lock, with live
identity, compatibility, and exact-delivery verification. Routine emergency work
would queue there; it would not invoke local Wrangler or the console in parallel.

The concrete enforcement work is outside a source-only guard: inventory every
identity/token/integration that can mutate `vanity`, make the existing CI writer
credential available only to its production job (a default-branch-restricted
GitHub Environment can hold it), and remove or narrow independent mutation grants.
Moving secrets, changing environment protections, creating/replacing credentials,
or reducing provider access require explicit user approval. None is performed
here. Do not revoke a shared account-wide grant without establishing its other
consumers; if vanity-only exclusivity cannot be scoped safely, stop that action
and present the exact affected access for decision.

An exceptional console/local break-glass deploy requires an explicit operator
handoff: suspend new CI publication, let the active writer finish, resolve any
ambiguous in-flight operation, then authorize one temporary operator writer.
Verify native identity and exact delivery, end that temporary write access, and
resume CI. An unexplained timeout or unknown mutation outcome is a stop condition,
not permission to race another writer. The normal emergency route remains the
locked native workflow.

This is a practical narrower operational boundary, not a native CAS guarantee.
A repository-only check cannot enforce the provider-access inventory or prevent
an account administrator from bypassing it. Acceptance of that boundary, evidence
that independent write routes were closed, and the ambiguity/break-glass policy
must be approved before this option could unblock #142/#144. They remain blocked
under the original strict promise. No access or provider configuration changed.
