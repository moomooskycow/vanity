import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 30_000 }).trim();
const revision = (sha) => assert.match(sha ?? "", /^[a-f0-9]{40}$/, "A full source revision is required");
const ancestor = (older, newer) => {
  try { git("merge-base", "--is-ancestor", older, newer); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
};

export function currentTrunk() {
  git("fetch", "--no-tags", "origin", "refs/heads/master");
  const trunk = git("rev-parse", "FETCH_HEAD");
  revision(trunk);
  return trunk;
}

export function promotionOrder(candidate, tested, check, live, trunk) {
  for (const sha of [candidate, tested, live, trunk]) revision(sha);
  assert.equal(check, "success", "The native repo gate and preflight must succeed");
  assert.equal(candidate, tested, "Candidate is not the exact tested source");
  assert.ok(ancestor(candidate, trunk), "Candidate is outside authorized trunk history");
  if (candidate === live) return "already-live";
  if (ancestor(candidate, live)) return "older-than-live";
  assert.ok(ancestor(live, candidate), "Candidate diverges from the live source");
  return "forward";
}

// This is an eligibility read, not another release scheduler. Public native
// Actions metadata requires no new credential or job permission. API failure,
// rate limits, truncation or a changed pagination total fail before mutation.
export async function newerTested(candidate, trunk, live) {
  // A tested merged branch absent from this candidate also blocks promotion;
  // do not guess which incomparable tested source should be treated as newest.
  const newer = git("rev-list", "--max-count=101", `${candidate}..${trunk}`).split("\n").filter(Boolean);
  assert.ok(newer.length <= 100, "Newer tested-source discovery exceeds its bound");
  const deadline = Date.now() + 60_000;
  async function* pages(path, field) {
    let total, seen = 0;
    for (let page = 1; page <= 10; page++) {
      const remaining = deadline - Date.now();
      assert.ok(remaining > 0, "Tested-source discovery timed out");
      const response = await fetch(`https://api.github.com/repos/moomooskycow/vanity/${path}&per_page=100&page=${page}`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "vanity-promotion" },
        signal: AbortSignal.timeout(Math.min(30_000, remaining)),
      });
      assert.ok(response.ok, `Native tested-source lookup: HTTP ${response.status}`);
      const body = await response.json();
      assert.ok(Number.isSafeInteger(body.total_count) && body.total_count >= 0 && body.total_count < 1000,
        "Native tested-source lookup is incomplete");
      total ??= body.total_count;
      assert.equal(body.total_count, total, "Native tested-source lookup changed during pagination");
      const entries = body[field];
      assert.ok(Array.isArray(entries) && entries.length <= 100, "Invalid native tested-source page");
      seen += entries.length;
      assert.ok(seen <= total && (seen === total || entries.length === 100), "Native tested-source lookup is incomplete");
      yield* entries;
      if (seen === total) return;
    }
    throw new Error("Native tested-source lookup exceeded its page bound");
  }
  for (const sha of newer) {
    if (!ancestor(live, sha)) continue;
    for await (const run of pages(`actions/workflows/ci.yml/runs?head_sha=${sha}`, "workflow_runs")) {
      if (!["push", "workflow_dispatch", "pull_request"].includes(run.event)) continue;
      if (run.event !== "pull_request" && run.head_branch !== "master") continue;
      assert.equal(run.head_sha, sha, "Native run source mismatch");
      assert.equal(run.path, ".github/workflows/ci.yml", "Foreign native workflow");
      assert.equal(run.head_repository?.full_name, "moomooskycow/vanity", "Foreign native repository");
      assert.ok(Number.isSafeInteger(run.id) && run.id > 0, "Invalid native run identity");
      for await (const job of pages(`actions/runs/${run.id}/jobs?filter=all`, "jobs")) {
        assert.equal(job.run_id, run.id, "Native job run mismatch");
        assert.equal(job.head_sha, sha, "Native job source mismatch");
        if (job.name !== "repo gate" || job.conclusion !== "success") continue;
        for (const name of ["Run repo-owned gate", "Dry-run actual Worker publication and committed public artifact without credentials"]) {
          assert.ok(job.steps?.some(step => step.name === name && step.conclusion === "success"), "Native gate proof is incomplete");
        }
        return sha;
      }
    }
  }
  return null;
}
