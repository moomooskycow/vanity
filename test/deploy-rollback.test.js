const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { createServer } = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const root = resolve(__dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

// The real deploy entry point invokes a child publisher and the native HTTP API.
// Only those provider boundaries are controlled; artifacts come from real Git.
test("native deployment recovery boundary", async (t) => {
  const { deploy, publicArtifact } = await import(process.env.VANITY_DEPLOY_MODULE ?? "../scripts/deploy.mjs");
  const revision = git("rev-parse", "HEAD");
  const prior = git("rev-parse", "HEAD~1");
  const origin = git("config", "--get", "remote.origin.url");
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  t.after(() => { process.env = originalEnv; global.fetch = originalFetch; });
  process.env.CLOUDFLARE_API_TOKEN = "controlled-provider-test";
  delete process.env.GITHUB_STEP_SUMMARY;
  const temp = mkdtempSync(join(tmpdir(), "vanity-recovery-test-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const remote = join(temp, "origin.git");
  execFileSync("git", ["clone", "--bare", "--quiet", root, remote]);
  execFileSync("git", ["--git-dir", remote, "update-ref", "refs/heads/master", revision]);
  process.env.GIT_CONFIG_COUNT = "1";
  process.env.GIT_CONFIG_KEY_0 = `url.file://${remote}.insteadOf`;
  process.env.GIT_CONFIG_VALUE_0 = origin;
  process.env.GIT_ALLOW_PROTOCOL = "file";
  const marker = join(temp, "published");
  let mode, state, writes, deliveryChecks;
  const versionIds = { A: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", B: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", C: "cccccccc-cccc-cccc-cccc-cccccccccccc" };
  const message = () => existsSync(marker) ? readFileSync(marker, "utf8") : "prior";
  const deployment = (name) => ({ id: `deployment-${name}`, annotations: { "workers/message": name === "B" ? message() : `deployment ${name}` }, versions: [{ version_id: versionIds[mode === "same-version-before-readback" && name === "C" ? "B" : name], percentage: 100 }] });
  const version = (name) => ({ id: versionIds[name], annotations: { "workers/tag": name === "A" ? prior : revision }, resources: { bindings: [{ name: "ASSETS", type: "assets" }] } });
  const server = createServer(async (request, response) => {
    const url = new URL(request.headers["x-original-url"]);
    if (existsSync(marker) && state === "A") state = "B";
    if (url.hostname === "api.cloudflare.com") {
      assert.equal(request.headers.authorization, "Bearer controlled-provider-test");
      const endpoint = url.pathname.split("/vanity")[1];
      let result;
      if (request.method === "POST") {
        let body = "";
        for await (const chunk of request) body += chunk;
        if (mode === "concurrent-after-check") state = "C";
        writes.push(JSON.parse(body));
        assert.equal(endpoint, "/deployments");
        assert.equal(url.search, ""); // never force a compatibility override
        assert.deepEqual(JSON.parse(body).versions, [{ version_id: versionIds.A, percentage: 100 }]);
        if (mode === "rollback-rejected") {
          response.statusCode = 409;
          return response.end(JSON.stringify({ success: false }));
        }
        state = "R";
        result = deployment("A"); result.id = "restored-A";
      } else if (endpoint === "/deployments") {
        if (["same-sha-before-readback", "same-version-before-readback"].includes(mode) && state === "B") state = "C";
        if (mode === "publisher-and-readback-fail" && state === "B") { response.statusCode = 502; return response.end(); }
        if (!result) result = { deployments: [state === "R" ? { ...deployment("A"), id: "restored-A" } : deployment(state)] };
      } else if (endpoint?.startsWith("/versions/")) {
        result = version(Object.keys(versionIds).find((name) => versionIds[name] === endpoint.slice("/versions/".length)));
        if (mode === "incompatible" && state === "A") result.resources.bindings.push({ name: "DB", type: "d1" });
      } else { response.statusCode = 404; return response.end(); }
      response.setHeader("content-type", "application/json");
      return response.end(JSON.stringify({ success: true, result }));
    }
    const file = url.pathname === "/" ? "index.html" : url.pathname === "/changelog" ? "changelog.html" : url.pathname.slice(1);
    if (state === "B" && !["success", "summary-failure", "concurrent-during-success"].includes(mode)) {
      if (mode === "concurrent") state = "C";
      response.statusCode = mode === "unknown" ? 200 : 503;
      return response.end("controlled candidate failure");
    }
    if (state === "R") deliveryChecks++;
    if (mode === "rollback-bad-delivery" && state === "R") { response.statusCode = 503; return response.end(); }
    const artifact = publicArtifact(state === "A" || state === "R" ? prior : revision);
    response.end(artifact.get(file));
    if (state === "B" && mode === "concurrent-during-success") state = "C";
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  global.fetch = (url, options = {}) => originalFetch(`http://127.0.0.1:${server.address().port}`, {
    ...options, headers: { ...options.headers, "x-original-url": String(url) },
  });
  for (const scenario of ["503", "unknown", "success", "concurrent", "rollback-rejected", "rollback-bad-delivery", "incompatible", "publisher-exit", "publisher-and-readback-fail", "summary-failure", "missing-receipt", "ambiguous-receipt", "wrong-receipt-target", "same-sha-before-readback", "same-version-before-readback", "concurrent-during-success", "concurrent-after-check"]) {
    await t.test(scenario, async () => {
      mode = scenario; state = "A"; writes = []; deliveryChecks = 0;
      if (mode === "summary-failure") process.env.GITHUB_STEP_SUMMARY = temp;
      else delete process.env.GITHUB_STEP_SUMMARY;
      rmSync(marker, { force: true });
      const receipt = { type: "deploy", version: 1, worker_name: scenario === "wrong-receipt-target" ? "other-worker" : "vanity", version_id: versionIds.B };
      const args = ["-e", `
        const fs = require('node:fs');
        fs.writeFileSync(${JSON.stringify(marker)}, process.argv.at(-1));
        ${scenario === "missing-receipt" ? "" : `fs.writeFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH, ${JSON.stringify(JSON.stringify(receipt) + "\n")});`}
        ${scenario === "ambiguous-receipt" ? `fs.appendFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH, ${JSON.stringify(JSON.stringify(receipt) + "\n")});` : ""}
        ${["publisher-exit", "publisher-and-readback-fail"].includes(scenario) ? "process.exit(1)" : ""}
      `, "--", "--message", `Git revision ${revision}; attempt ${randomUUID()}`];
      if (["success", "summary-failure"].includes(scenario)) {
        await deploy(revision, args); assert.equal(state, "B");
      } else if (scenario === "publisher-and-readback-fail") {
        await assert.rejects(deploy(revision, args), /Publication failed: Command failed:[\s\S]*verification failed: Cloudflare GET \/deployments: HTTP 502; rollback skipped/);
      } else if (["missing-receipt", "ambiguous-receipt", "wrong-receipt-target"].includes(scenario)) {
        await assert.rejects(deploy(revision, args), /Native publication identity unproven:[\s\S]*rollback skipped: candidate identity unproven/);
      } else if (["same-sha-before-readback", "same-version-before-readback"].includes(scenario)) {
        await assert.rejects(deploy(revision, args), /Candidate (version|deployment) superseded before readback[\s\S]*rollback skipped: candidate identity unproven/);
      } else if (scenario === "concurrent-during-success") {
        await assert.rejects(deploy(revision, args), /Candidate deployment superseded during delivery[\s\S]*rollback skipped: candidate superseded/);
      } else if (scenario === "incompatible") {
        await assert.rejects(deploy(revision, args), /stateless assets-only/);
        assert.equal(existsSync(marker), false);
      } else {
        const expected = ["503", "unknown", "publisher-exit"].includes(scenario) ? /rollback restored/ : ["concurrent", "concurrent-after-check"].includes(scenario) ? /rollback skipped: candidate superseded/ : /rollback unconfirmed/;
        await assert.rejects(deploy(revision, args), expected);
      }
      if (["503", "unknown", "publisher-exit"].includes(scenario)) {
        assert.equal(writes.length, 1); assert.equal(state, "R"); assert.equal(deliveryChecks, publicArtifact(prior).size * 2);
      } else if (["concurrent", "success", "summary-failure", "publisher-and-readback-fail", "incompatible", "missing-receipt", "ambiguous-receipt", "wrong-receipt-target", "same-sha-before-readback", "same-version-before-readback", "concurrent-during-success"].includes(scenario)) assert.equal(writes.length, 0);
      else assert.equal(writes.length, 1);
      if (["concurrent", "same-sha-before-readback", "same-version-before-readback", "concurrent-during-success"].includes(scenario)) assert.equal(state, "C");
    });
  }
});
