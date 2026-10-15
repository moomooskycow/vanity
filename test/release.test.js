const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");

test("release metadata refuses missing baselines, stale sources and failed/skipped gates", async () => {
  const { releaseCurrent } = await import("../scripts/release.mjs");
  const valid = { revision: "a".repeat(40), baseline: "b".repeat(40), current: "a".repeat(40), check: "success", deploy: "success" };
  assert.equal(releaseCurrent(valid), true);
  assert.equal(releaseCurrent({ ...valid, current: "c".repeat(40) }), false);
  for (const field of ["revision", "baseline", "current"]) {
    for (const invalid of [undefined, "", "a".repeat(39), "not-a-sha"]) assert.throws(() => releaseCurrent({ ...valid, [field]: invalid }));
  }
  for (const field of ["check", "deploy"]) {
    for (const result of [undefined, "failure", "skipped", "cancelled", "pending"]) assert.throws(() => releaseCurrent({ ...valid, [field]: result }));
  }
  const baseline = require("../release-please-config.json")["bootstrap-sha"];
  execFileSync("git", ["merge-base", "--is-ancestor", baseline, "HEAD"], { cwd: root });
});

test("title checking treats shell syntax as inert data and rejects malformed titles", async () => {
  const { checkTitle } = await import("../scripts/release.mjs");
  for (const title of ["feat: read release notes", "fix(ui): retain focus", "feat!: change interface", "chore(master): release 1.0.0"]) checkTitle(title);
  for (const title of [undefined, "", "Add notes", "fix: ", "fix: title\nfeat: injected", "fix: trailing newline\n"]) assert.throws(() => checkTitle(title));
  const sentinel = path.join(root, "release-title-must-not-execute");
  const run = spawnSync(process.execPath, ["scripts/release.mjs", "title"], {
    cwd: root, env: { ...process.env, PR_TITLE: `fix: $(touch ${sentinel})` }, encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(sentinel), false);
});

test("native workflow approval is restricted to the current same-repository generator PR and configured runs", async (t) => {
  const { releasePr, nativeRun } = await import("../scripts/release.mjs");
  const repo = "moomooskycow/vanity", sha = "a".repeat(40);
  const generated = { number: 140, headBranchName: "release-please--branches--master--components--vanity" };
  const valid = { state: "open", base: { ref: "master" }, head: { repo: { full_name: repo }, ref: generated.headBranchName, sha }, user: { login: "github-actions[bot]" } };
  await t.test("accepts the actual release-please component branch", () => {
    assert.equal(releasePr(valid, repo, generated), sha);
  });
  await t.test("rejects a look-alike branch absent from the generator output", () => {
    const pr = structuredClone(valid); pr.head.ref = "release-please--branches--master";
    assert.throws(() => releasePr(pr, repo, generated));
  });
  for (const mutate of [p => p.state = "closed", p => p.base.ref = "other", p => p.head.repo.full_name = "attacker/vanity", p => p.head.ref = "other", p => p.user.login = "other", p => p.head.sha = "short"]) {
    const pr = structuredClone(valid); mutate(pr); assert.throws(() => releasePr(pr, repo, generated));
  }
  for (const workflow of ["ci.yml", "allie.yml"]) {
    const validRun = { head_sha: sha, head_repository: { full_name: repo }, path: `.github/workflows/${workflow}`, event: "pull_request" };
    nativeRun(validRun, repo, sha, workflow);
    for (const mutate of [r => r.head_sha = "b".repeat(40), r => r.head_repository.full_name = "attacker/vanity", r => r.path = ".github/workflows/foreign.yml", r => r.event = "workflow_dispatch"]) {
      const run = structuredClone(validRun); mutate(run); assert.throws(() => nativeRun(run, repo, sha, workflow));
    }
  }
});

test("generated notes render safely without raw HTML, executable URLs or extra public files", async () => {
  const { notesHtml, changelog } = await import("../scripts/changelog.mjs");
  const { publicArtifact } = await import("../scripts/deploy.mjs");
  const notes = notesHtml('# Changelog\n## 1.0.0\n### Features\n* **notes:** read [changes](https://github.com/moomooskycow/vanity/pull/1)\n<script>alert(1)</script>\n[bad](javascript:alert(1))\n[bad](https://evil.example/)');
  assert.match(notes, /<h2>1\.0\.0<\/h2>/);
  assert.match(notes, /<strong>notes:<\/strong>/);
  assert.match(notes, /<a href="https:\/\/github.com\/moomooskycow\/vanity\/pull\/1">changes<\/a>/);
  assert.doesNotMatch(notes, /<script|href="javascript|href="https:\/\/evil|<h1/);
  assert.match(notes, /&lt;script&gt;/);
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const artifact = publicArtifact(sha);
  assert.deepEqual([...artifact.keys()], ["index.html", "quotes.js", "quote-chyron.js", "assets/portrait-dots.svg", "assets/og-image.png", "changelog.html"]);
  assert.equal(artifact.get("changelog.html").toString(), changelog(sha).toString());
  assert.match(changelog(sha).toString(), new RegExp(sha));
  assert.doesNotMatch(changelog(sha).toString(), /<!-- release -->|<!-- notes -->/);
  assert.equal(publicArtifact(require("../release-please-config.json")["bootstrap-sha"]).size, 5);
});
