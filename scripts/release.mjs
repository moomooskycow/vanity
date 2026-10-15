import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export function checkTitle(title) {
  assert.doesNotMatch(title ?? "", /[\r\n]/, "A title must be one line");
  assert.match(title ?? "", /^(feat|fix|perf|chore|docs|test|build|ci|refactor|style|revert)(\([^\r\n()]+\))?!?: [^\r\n]+$/,
    "Use a Conventional Commit title, e.g. feat: read release notes");
}

export function releaseCurrent({ revision, baseline, current, check, deploy }) {
  assert.equal(check, "success", "Repo gate must succeed");
  assert.equal(deploy, "success", "Deployment and smoke must succeed");
  for (const sha of [revision, baseline, current]) assert.match(sha ?? "", /^[a-f0-9]{40}$/, "A full Git revision is required");
  return current === revision;
}

export function releasePr(pr, repo) {
  assert.equal(pr.state, "open");
  assert.equal(pr.base.ref, "master");
  assert.equal(pr.head.repo.full_name, repo, "Foreign release PR");
  assert.equal(pr.user.login, "github-actions[bot]");
  assert.equal(pr.head.ref, "release-please--branches--master");
  assert.match(pr.head.sha, /^[a-f0-9]{40}$/);
  return pr.head.sha;
}

export function nativeRun(run, repo, sha, workflow) {
  assert.equal(run.head_sha, sha, "Moved native run");
  assert.equal(run.head_repository.full_name, repo, "Foreign native run");
  assert.equal(run.path, `.github/workflows/${workflow}`);
  assert.equal(run.event, "pull_request");
}

async function approveCi() {
  const repo = process.env.GITHUB_REPOSITORY;
  assert.equal(repo, "moomooskycow/vanity");
  const number = JSON.parse(process.env.RELEASE_PR).number;
  assert.ok(Number.isSafeInteger(number) && number > 0);
  const api = async (path, method = "GET") => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      method, headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    });
    assert.ok(response.ok, `GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const sha = releasePr(await api(`pulls/${number}`), repo);
  for (const workflow of ["ci.yml", "allie.yml"]) {
    let found = false;
    // GitHub creates bot-PR runs asynchronously. Bound discovery; never dispatch
    // a replacement check or restart a run that has already started.
    for (let attempt = 0; attempt < 24; attempt++) {
      assert.equal(releasePr(await api(`pulls/${number}`), repo), sha, "Release PR moved");
      const { workflow_runs: runs } = await api(`actions/workflows/${workflow}/runs?event=pull_request&head_sha=${sha}&per_page=100`);
      if (runs.length) {
        for (const run of runs) {
          nativeRun(run, repo, sha, workflow);
          if (run.conclusion === "action_required") {
            assert.equal(releasePr(await api(`pulls/${number}`), repo), sha, "Release PR moved");
            await api(`actions/runs/${run.id}/approve`, "POST");
            const actual = await api(`actions/runs/${run.id}`);
            nativeRun(actual, repo, sha, workflow);
            console.log(JSON.stringify({ approved: run.id, sha, status: actual.status, conclusion: actual.conclusion }));
          } else console.log(JSON.stringify({ already_started: run.id, sha, status: run.status, conclusion: run.conclusion }));
        }
        found = true;
        break;
      }
      await delay(5000);
    }
    assert.ok(found, `Missing exact-head native ${workflow} run; nothing dispatched`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  assert.equal(process.argv.length, 3, "Usage: node scripts/release.mjs title|current|approve-ci");
  if (mode === "title") checkTitle(process.env.PR_TITLE);
  else if (mode === "approve-ci") await approveCi();
  else if (mode === "current") {
    const revision = process.env.GITHUB_SHA;
    const baseline = JSON.parse(readFileSync("release-please-config.json"))["bootstrap-sha"];
    const current = execFileSync("git", ["ls-remote", "origin", "refs/heads/master"], { encoding: "utf8" }).split(/\s/)[0];
    const eligible = releaseCurrent({ revision, baseline, current, check: process.env.CHECK_RESULT, deploy: process.env.DEPLOY_RESULT });
    execFileSync("git", ["merge-base", "--is-ancestor", baseline, revision]);
    appendFileSync(process.env.GITHUB_OUTPUT, `current=${eligible}\n`);
    if (!eligible) console.log("Superseded source; no release metadata publication.");
  } else throw new Error("Usage: node scripts/release.mjs title|current|approve-ci");
}
