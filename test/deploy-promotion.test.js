const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync } = require("node:fs");
const { createServer } = require("node:http");
const { once } = require("node:events");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const root = resolve(__dirname, "..");

test("forward promotion through the real deploy command", async (t) => {
  const temp = mkdtempSync(join(tmpdir(), "vanity-promotion-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const repo = join(temp, "repo"), remote = join(temp, "origin.git"), statePath = join(temp, "provider.json");
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", root, repo]);
  const git = (...args) => execFileSync("git", ["-c", "user.name=Promotion Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" }).trim();
  // Exercise current source before committing the repair, never edit its logic.
  copyFileSync(join(root, "scripts/deploy.mjs"), join(repo, "scripts/deploy.mjs"));
  try { copyFileSync(join(root, "scripts/promotion.mjs"), join(repo, "scripts/promotion.mjs")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  git("add", "scripts"); git("commit", "--quiet", "--allow-empty", "-m", "fixture A"); const A = git("rev-parse", "HEAD");
  git("commit", "--quiet", "--allow-empty", "-m", "fixture B"); const B = git("rev-parse", "HEAD");
  git("commit", "--quiet", "--allow-empty", "-m", "fixture C"); const C = git("rev-parse", "HEAD");
  git("checkout", "--quiet", "--detach", A);
  git("commit", "--quiet", "--allow-empty", "-m", "divergent D"); const D = git("rev-parse", "HEAD");
  git("checkout", "--quiet", "--detach", C);
  git("merge", "--quiet", "--no-ff", "--no-edit", D); const M = git("rev-parse", "HEAD");
  execFileSync("git", ["clone", "--quiet", "--bare", repo, remote]);
  execFileSync("git", ["--git-dir", remote, "update-ref", "refs/heads/master", C]);
  git("remote", "set-url", "origin", remote);
  const provider = join(repo, "node_modules/wrangler/bin/wrangler.js"); mkdirSync(join(repo, "node_modules/wrangler/bin"), { recursive: true });
  writeFileSync(provider, `
    const fs = require('node:fs');
    if (!process.argv.includes('--dry-run')) {
      const s = JSON.parse(fs.readFileSync(process.env.PROVIDER_STATE));
      s.mutations++; s.live = process.env.SOURCE_SHA; s.id = 'published-' + s.live;
      fs.writeFileSync(process.env.PROVIDER_STATE, JSON.stringify(s));
    }
  `);
  const { publicArtifact } = await import(pathToFileURL(join(repo, "scripts/deploy.mjs")));
  const artifacts = new Map([A, B, C, D, M].map(sha => [sha, publicArtifact(sha)]));
  let mode;
  const run = { id: 7, head_sha: C, head_branch: "master", path: ".github/workflows/ci.yml", event: "push", head_repository: { full_name: "moomooskycow/vanity" }, conclusion: "failure" };
  const gate = { run_id: 7, head_sha: C, name: "repo gate", conclusion: "success", steps: [
    { name: "Run repo-owned gate", conclusion: "success" },
    { name: "Dry-run actual Worker publication and committed public artifact without credentials", conclusion: "success" },
  ] };
  const server = createServer((request, response) => {
    const url = new URL(request.headers["x-original-url"]);
    const s = JSON.parse(readFileSync(statePath));
    if (url.hostname === "api.github.com") {
      assert.equal(request.headers.authorization, undefined, "Public eligibility reads need no new credential");
      response.setHeader("content-type", "application/json");
      if (mode === "metadata-error") { response.statusCode = 503; return response.end("{}"); }
      if (url.pathname.endsWith("/jobs")) {
        const target = mode === "incomparable-pr-tested" ? D : C;
        const proof = { ...gate, head_sha: target };
        const jobs = ["newer-untested", "merged-pr-untested"].includes(mode) ? [{ ...proof, conclusion: "failure" }] : [proof];
        return response.end(JSON.stringify({ total_count: jobs.length, jobs }));
      }
      const queried = url.searchParams.get("head_sha");
      assert.ok([C, D, M].includes(queried));
      if (mode === "metadata-incomplete") return response.end(JSON.stringify({ total_count: 1, workflow_runs: [] }));
      if (["merged-pr-tested", "incomparable-pr-tested", "merged-pr-untested"].includes(mode)) {
        const target = mode === "incomparable-pr-tested" ? D : C;
        const runs = queried === target && !url.searchParams.has("branch") ? [{ ...run, head_sha: target, event: "pull_request", head_branch: "feature" }] : [];
        return response.end(JSON.stringify({ total_count: runs.length, workflow_runs: runs }));
      }
      let runs = ["newer-tested", "newer-untested", "paginated-newer-tested"].includes(mode) ? [run] : [];
      if (mode === "paginated-newer-tested" && url.searchParams.get("page") === "1") runs = Array.from({ length: 100 }, (_, i) => ({ ...run, id: 100 + i, event: "schedule" }));
      return response.end(JSON.stringify({ total_count: mode === "paginated-newer-tested" ? 101 : runs.length, workflow_runs: runs }));
    }
    if (url.hostname === "api.cloudflare.com") {
      assert.equal(request.headers.authorization, "Bearer controlled-provider-test");
      if (url.pathname.endsWith("/deployments")) {
        s.reads++;
        if (mode === "concurrent" && s.reads === 2 && s.mutations === 0) { s.live = C; s.id = "concurrent-C"; }
        writeFileSync(statePath, JSON.stringify(s));
        return response.end(JSON.stringify({ success: true, result: { deployments: [{ id: s.id, versions: [{ version_id: s.live, percentage: mode === "split-live" ? 50 : 100 }] }] } }));
      }
      const sha = url.pathname.split("/").at(-1);
      return response.end(JSON.stringify({ success: true, result: { id: sha, annotations: { "workers/tag": sha } } }));
    }
    const file = url.pathname === "/" ? "index.html" : url.pathname === "/changelog" ? "changelog.html" : url.pathname.slice(1);
    response.end(artifacts.get(s.live).get(file));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const hook = join(temp, "provider-boundary.mjs");
  writeFileSync(hook, `
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = (url, options = {}) => {
      if (!['api.cloudflare.com', 'api.github.com', 'phaedrus.io', 'www.phaedrus.io'].includes(new URL(url).hostname)) return nativeFetch(url, options);
      return nativeFetch('http://127.0.0.1:${server.address().port}', { ...options, headers: { ...options.headers, 'x-original-url': String(url) } });
    };
  `);
  const scenarios = ["forward", "live-newer", "equal", "untested", "wrong-tested-sha", "wrong-checkout", "foreign", "divergent-live", "concurrent", "newer-tested", "newer-untested", "paginated-newer-tested", "metadata-error", "metadata-incomplete", "split-live", "merged-pr-tested", "incomparable-pr-tested", "merged-pr-untested"];
  for (const scenario of scenarios.filter(s => !process.env.VANITY_PROMOTION_SCENARIO || s === process.env.VANITY_PROMOTION_SCENARIO)) {
    await t.test(scenario, async () => {
      mode = scenario;
      execFileSync("git", ["--git-dir", remote, "update-ref", "refs/heads/master", mode.startsWith("merged-pr") || mode === "incomparable-pr-tested" ? M : C]);
      const candidate = mode === "foreign" ? D : B;
      git("checkout", "--quiet", "--detach", mode === "wrong-checkout" ? C : candidate);
      const output = join(temp, "verified-source"); rmSync(output, { force: true });
      const live = mode === "live-newer" ? C : mode === "equal" ? B : mode === "divergent-live" ? D : A;
      writeFileSync(statePath, JSON.stringify({ live, id: "prior-" + live, mutations: 0, reads: 0 }));
      const child = spawn(process.execPath, ["scripts/deploy.mjs"], { cwd: repo, env: {
        ...process.env, NODE_OPTIONS: `--import=${hook}`, GIT_ALLOW_PROTOCOL: "file", SOURCE_SHA: candidate,
        CLOUDFLARE_API_TOKEN: "controlled-provider-test", PROVIDER_STATE: statePath,
        CHECK_RESULT: mode === "untested" ? "failure" : "success", TESTED_SHA: mode === "wrong-tested-sha" ? A : candidate,
        GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: output,
      }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = ""; child.stdout.on("data", d => stdout += d); child.stderr.on("data", d => stderr += d);
      const [status] = await once(child, "close");
      const actual = JSON.parse(readFileSync(statePath));
      const verified = existsSync(output) ? readFileSync(output, "utf8") : "";
      assert.equal(verified, ["forward", "newer-untested", "merged-pr-untested", "equal"].includes(mode) ? `verified_sha=${B}\n` : "", stderr);
      if (["forward", "newer-untested", "merged-pr-untested"].includes(mode)) {
        assert.equal(status, 0, stderr); assert.equal(actual.mutations, 1); assert.equal(actual.live, B);
        assert.match(stdout, new RegExp(`"revision":"${B}"`));
      } else if (["live-newer", "equal", "concurrent", "newer-tested", "paginated-newer-tested", "merged-pr-tested", "incomparable-pr-tested"].includes(mode)) {
        assert.equal(status, 0, stderr); assert.equal(actual.mutations, 0); assert.match(stdout, /"promotion":"skipped"/);
        assert.equal(actual.live, mode === "concurrent" ? C : live);
      } else {
        const failures = {
          untested: /native repo gate and preflight must succeed/,
          "wrong-tested-sha": /not the exact tested source/,
          "wrong-checkout": /checkout differs from tested source/,
          foreign: /outside authorized trunk history/,
          "divergent-live": /diverges from the live source/,
          "metadata-error": /Native tested-source lookup: HTTP 503/,
          "metadata-incomplete": /Native tested-source lookup is incomplete/,
          "split-live": /Live version is not fully active/,
        };
        assert.equal(status, 1, stdout); assert.match(stderr, failures[mode]); assert.equal(actual.mutations, 0);
      }
    });
  }
});
