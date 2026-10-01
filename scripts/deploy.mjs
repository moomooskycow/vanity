import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const appId = "b9e45cbb-9f2a-418e-ab91-dc5a2b157c25";
const domains = ["https://phaedrus.io", "https://www.phaedrus.io"];
const publicFiles = [
  "index.html",
  "quotes.js",
  "quote-chyron.js",
  "canary-observer.js",
  "assets/portrait-dots.svg",
  "assets/og-image.png",
];
const root = fileURLToPath(new URL("../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function publicArtifact(revision) {
  assert.match(revision, /^[a-f0-9]{40}$/, "A full Git revision is required");
  return new Map(publicFiles.map((path) => [
    path, execFileSync("git", ["show", `${revision}:${path}`], { cwd: root }),
  ]));
}

// One request producer for production and credential-free validation.
function deploymentRequest() {
  return {
    url: `https://api.digitalocean.com/v2/apps/${appId}/deployments`,
    method: "POST",
    body: JSON.stringify({ force_build: true }),
  };
}

function validateDeploymentRequest(request) {
  // DigitalOcean apps_create_deployment, pinned provider contract:
  // https://github.com/digitalocean/openapi/blob/257e7e4ad258fd0ff716a685ffed915922417178/specification/resources/apps/apps_create_deployment.yml
  // Its request schema permits force_build:boolean; there is no inert POST mode.
  assert.equal(request.method, "POST");
  assert.match(request.url, /^https:\/\/api\.digitalocean\.com\/v2\/apps\/[a-f0-9-]{36}\/deployments$/);
  const body = JSON.parse(request.body);
  assert.equal(typeof body.force_build, "boolean", "Provider force_build must be boolean");
  assert.deepEqual(Object.keys(body), ["force_build"], "Unsupported deployment request field");
}

async function preflight(revision, request) {
  validateDeploymentRequest(request);
  const artifact = publicArtifact(revision);
  // Serve only committed public bytes, never the checkout or private generators.
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const bytes = artifact.get(pathname === "/" ? "index.html" : pathname.slice(1));
    response.statusCode = bytes === undefined ? 404 : 200;
    response.end(bytes);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const target = `http://127.0.0.1:${server.address().port}`;
    const results = await smoke(revision, [target]);
    for (const draft of ["bio.md", "explore/", "scripts/generate-taste.mjs"]) {
      assert.equal((await fetch(`${target}/${draft}`)).status, 404, `Non-public path exposed: ${draft}`);
    }
    console.log(JSON.stringify({
      revision, preflight: "pass", request: { url: request.url, method: request.method, body: JSON.parse(request.body) },
      publicAssets: results.length,
      trustedMainOnly: ["provider authentication and app spec", "current master", "remote build", "ACTIVE exact source", "both-domain delivery"],
    }));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

// Only the committed, approved public surface is inspected. This never opens
// Daybook, regenerates catalogs, or uploads local drafts or diagnostic content.
export async function smoke(revision, targets = domains) {
  const artifact = publicArtifact(revision);
  const results = [];
  for (const domain of targets) {
    for (const path of publicFiles) {
      const url = new URL(path === "index.html" ? "/" : `/${path}`, domain);
      url.searchParams.set("vanity_revision", revision);
      const response = await fetch(url, {
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(30_000),
      });
      assert.equal(response.status, 200, `Smoke HTTP failure: ${domain}/${path}`);
      const expected = digest(artifact.get(path));
      const actual = digest(Buffer.from(await response.arrayBuffer()));
      assert.equal(actual, expected, `Smoke revision mismatch: ${domain}/${path}`);
      const result = { domain, path, sha256: actual, status: "pass" };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
  return results;
}

async function api(path, request) {
  assert.ok(process.env.DIGITALOCEAN_API_TOKEN, "DIGITALOCEAN_API_TOKEN is required");
  const response = await fetch(request?.url ?? `https://api.digitalocean.com/v2/apps/${appId}${path}`, {
    method: request?.method ?? "GET",
    headers: {
      authorization: `Bearer ${process.env.DIGITALOCEAN_API_TOKEN.trim()}`,
      "content-type": "application/json",
    },
    body: request?.body,
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok, `DigitalOcean ${method} ${path || "/"}: HTTP ${response.status}`);
  return response.json();
}

async function deploy(revision, request) {
  const { app } = await api("");
  const source = app.spec.static_sites?.find((site) => site.name === "web");
  assert.equal(source?.git?.repo_clone_url, "https://github.com/moomooskycow/vanity.git");
  assert.equal(source.git.branch, "master");
  const [master] = execFileSync("git", ["ls-remote", "origin", "refs/heads/master"], { cwd: root, encoding: "utf8" }).split(/\s/);
  assert.equal(master, revision, "Source revision is no longer master; the newer merge owns deployment");
  const previous = app.active_deployment?.id;
  const { deployment: created } = await api("/deployments", request);
  const deploymentUrl = `https://cloud.digitalocean.com/apps/${appId}/deployments/${created.id}`;
  console.log(JSON.stringify({ revision, deployment: created.id, previous, deploymentUrl }));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Vanity production\n\nRevision: \`${revision}\`\n\n[Deployment ${created.id}](${deploymentUrl})\n\nPrior deployment retained: \`${previous}\`\n`);
  }

  const deadline = Date.now() + 15 * 60_000;
  let deployment = created;
  while (deployment.phase !== "ACTIVE") {
    assert.ok(!["ERROR", "CANCELED", "SUPERSEDED"].includes(deployment.phase),
      `Deployment ${created.id} failed: ${deployment.phase}`);
    assert.ok(Date.now() < deadline, `Deployment ${created.id} timed out`);
    console.log(JSON.stringify({ deployment: created.id, phase: deployment.phase }));
    await delay(10_000);
    ({ deployment } = await api(`/deployments/${created.id}`));
  }
  assert.equal(deployment.static_sites?.find((site) => site.name === "web")?.source_commit_hash,
    revision, "DigitalOcean published a different source revision; see deployment and newer master runs");
  const { app: active } = await api("");
  assert.equal(active.active_deployment?.id, created.id, "Deployment is not the active production deployment");
  const results = await smoke(revision);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `\nPost-deploy smoke passed: ${results.length} exact public asset checks across both domains.\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && ["--preflight", "--smoke-only"].includes(args[0])),
    "Usage: node scripts/deploy.mjs [--preflight | --smoke-only]; unsupported arguments");
  const revision = process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert.match(revision, /^[a-f0-9]{40}$/, "A full Git revision is required");
  if (args[0] === "--smoke-only") await smoke(revision);
  else {
    const request = deploymentRequest();
    await preflight(revision, request);
    if (args[0] !== "--preflight") await deploy(revision, request);
  }
}
