import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { changelog } from "./changelog.mjs";
import { currentTrunk, newerTested, promotionOrder } from "./promotion.mjs";

const accountId = "b069014f6a46558ea9146fb6c4ff8f6c";
const domains = ["https://phaedrus.io", "https://www.phaedrus.io"];
const publicFiles = [
  "index.html",
  "quotes.js",
  "quote-chyron.js",
  "assets/portrait-dots.svg",
  "assets/og-image.png",
];
const root = fileURLToPath(new URL("../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function publicArtifact(revision) {
  assert.match(revision, /^[a-f0-9]{40}$/, "A full Git revision is required");
  const artifact = new Map(publicFiles.map((path) => [
    path, execFileSync("git", ["show", `${revision}:${path}`], { cwd: root }),
  ]));
  if (execFileSync("git", ["ls-tree", "--name-only", revision, "changelog.html"], { cwd: root, encoding: "utf8" }).trim()) {
    artifact.set("changelog.html", changelog(revision));
  }
  return artifact;
}

// One native provider invocation: PR adds only --dry-run; production does not.
function deploymentArgs(directory, revision) {
  return [
    join(root, "node_modules/wrangler/bin/wrangler.js"), "deploy",
    "--config", join(root, "wrangler.jsonc"), "--assets", directory,
    "--tag", revision, "--message", `Git revision ${revision}`,
  ];
}

async function preflight(revision, directory, args) {
  execFileSync(process.execPath, [...args, "--dry-run"], { cwd: root, stdio: "inherit" });
  const server = createServer((incoming, response) => {
    const requested = new URL(incoming.url, "http://localhost").pathname;
    const pathname = requested === "/changelog" ? "/changelog.html" : requested;
    const file = resolve(directory, `.${pathname}${pathname.endsWith("/") ? "index.html" : ""}`);
    try {
      assert.ok(file.startsWith(`${directory}${sep}`), "Path escapes artifact");
      response.end(readFileSync(file));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const results = await smoke(revision, [`http://127.0.0.1:${server.address().port}`]);
    console.log(JSON.stringify({
      revision, preflight: "pass", command: [process.execPath, ...args, "--dry-run"],
      publicAssets: results.length,
      trustedMainOnly: ["provider authentication", "tested trunk source and live ancestry", "active Worker version tag", "both-domain delivery"],
    }));
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

// Only committed, approved public files are materialized or delivered. Neither
// Daybook nor local drafts, generators, source/config or evidence are uploaded.
async function readDelivery(revision, targets, deadline, paths, absent = new Set()) {
  const results = [];
  for (const domain of targets) {
    for (const path of paths) {
      const url = new URL(path === "index.html" ? "/" : path === "changelog.html" ? "/changelog" : `/${path}`, domain);
      url.searchParams.set("vanity_revision", revision);
      const remaining = deadline - Date.now();
      assert.ok(remaining > 0, "Healthy edge convergence timed out");
      const response = await fetch(url, {
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(30_000, remaining)))),
      });
      if (!(response.status === 404 && absent.has(`${domain}/${path}`))) {
        assert.equal(response.status, 200, `Smoke HTTP failure: ${domain}/${path}`);
      }
      results.push({ domain, path, sha256: digest(Buffer.from(await response.arrayBuffer())), httpStatus: response.status, status: response.status === 200 ? "pass" : "prior-absent" });
    }
  }
  return results;
}

export async function smoke(revision, targets = domains) {
  const artifact = publicArtifact(revision);
  const results = await readDelivery(revision, targets, Infinity, [...artifact.keys()]);
  for (const result of results) {
    assert.equal(result.sha256, digest(artifact.get(result.path)),
      `Smoke revision mismatch: ${result.domain}/${result.path}`);
    console.log(JSON.stringify(result));
  }
  return results;
}

// Readiness after publication, not a generic retry: only observed prior bytes
// (including a genuinely new path's exact prior 404) may coexist with new bytes.
// The URL, headers, status and exact-byte expectations never change between polls.
export async function awaitDelivery(revision, previous, targets = domains, timeoutMs = 60_000) {
  const expected = new Map([...publicArtifact(revision)].map(([path, bytes]) => [path, digest(bytes)]));
  const old = new Map(previous.map((result) => [`${result.domain}/${result.path}`, result]));
  const absent = new Set(previous.filter((result) => result.httpStatus === 404).map((result) => `${result.domain}/${result.path}`));
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const results = await readDelivery(revision, targets, deadline, [...expected.keys()], absent);
    const pending = [];
    for (const result of results) {
      if (result.httpStatus === 200 && result.sha256 === expected.get(result.path)) continue;
      const prior = old.get(`${result.domain}/${result.path}`);
      assert.equal(result.httpStatus, prior?.httpStatus ?? 200, `Unexpected edge status: ${result.domain}/${result.path}`);
      assert.equal(result.sha256, prior?.sha256,
        `Unexpected edge content: ${result.domain}/${result.path}`);
      pending.push({ domain: result.domain, path: result.path });
    }
    if (pending.length === 0) {
      for (const result of results) console.log(JSON.stringify(result));
      return results;
    }
    assert.ok(Date.now() < deadline, "Healthy edge convergence timed out");
    console.log(JSON.stringify({ revision, readiness: "prior public bytes still visible", pending }));
    await delay(Math.min(2_000, deadline - Date.now()));
  }
}

async function api(path) {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/vanity${path}`, {
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN.trim()}` },
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok, `Cloudflare GET ${path}: HTTP ${response.status}`);
  const body = await response.json();
  assert.equal(body.success, true, "Cloudflare API rejected version lookup");
  return body.result;
}

function soleVersion(deployment) {
  assert.ok(deployment?.id, "Missing live deployment identity");
  assert.equal(deployment.versions.length, 1, "Expected one live production version");
  assert.equal(deployment.versions[0].percentage, 100, "Live version is not fully active");
  assert.ok(deployment.versions[0].version_id, "Missing live version identity");
  return deployment.versions[0].version_id;
}

function verifiedSource(revision) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verified_sha=${revision}\n`);
}

async function deploy(revision, args) {
  assert.equal(process.env.CHECK_RESULT, "success", "The native repo gate and preflight must succeed");
  assert.equal(process.env.TESTED_SHA, revision, "Candidate is not the exact tested source");
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), revision, "Native publisher checkout differs from tested source");
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  const trunk = currentTrunk();
  const { deployments: previous } = await api("/deployments");
  const priorId = soleVersion(previous[0]);
  const priorVersion = await api(`/versions/${priorId}`);
  assert.equal(priorVersion.id, priorId, "Live version identity mismatch");
  const priorRevision = priorVersion.annotations["workers/tag"];
  const order = promotionOrder(revision, process.env.TESTED_SHA, process.env.CHECK_RESULT, priorRevision, trunk);
  const newer = order === "forward" ? await newerTested(revision, trunk, priorRevision) : null;
  if (order !== "forward" || newer) {
    await smoke(priorRevision);
    const { deployments: current } = await api("/deployments");
    assert.equal(current[0]?.id, previous[0].id, "Live deployment changed during skipped promotion verification");
    assert.equal(soleVersion(current[0]), priorId, "Live version changed during skipped promotion verification");
    console.log(JSON.stringify({ revision, promotion: "skipped", reason: newer ? "tested-trunk-source-not-included" : order, newer, live: priorRevision, deployment: previous[0].id }));
    if (order === "already-live") verifiedSource(revision);
    return;
  }
  const priorArtifact = publicArtifact(priorRevision);
  const paths = [...publicArtifact(revision).keys()];
  // A missing path is permissible only when the exact prior source did not
  // contain it. Observe its real 404 bytes before mutation, never assume them.
  const absent = new Set(domains.flatMap((domain) => paths.filter((path) => !priorArtifact.has(path)).map((path) => `${domain}/${path}`)));
  const priorDelivery = await readDelivery(revision, domains, Infinity, paths, absent);
  const { deployments: before } = await api("/deployments");
  const beforeId = soleVersion(before[0]);
  if (before[0].id !== previous[0].id || beforeId !== priorId) {
    console.log(JSON.stringify({ revision, promotion: "skipped", reason: "live-deployment-changed", deployment: before[0].id, version: beforeId }));
    return;
  }
  execFileSync(process.execPath, args, { cwd: root, stdio: "inherit", timeout: 120_000 });
  const { deployments } = await api("/deployments");
  const active = deployments[0];
  assert.equal(active.versions.length, 1, "Expected one active production version");
  assert.equal(active.versions[0].percentage, 100, "Production version is not fully active");
  const versionId = active.versions[0].version_id;
  const version = await api(`/versions/${versionId}`);
  assert.equal(version.annotations["workers/tag"], revision, "Cloudflare published a different source revision");
  const deploymentUrl = `https://dash.cloudflare.com/${accountId}/workers/services/view/vanity/production/deployments`;
  console.log(JSON.stringify({ revision, deployment: active.id, version: versionId, previous: previous[0]?.id, deploymentUrl }));
  const results = await awaitDelivery(revision, priorDelivery);
  const { deployments: delivered } = await api("/deployments");
  assert.equal(delivered[0]?.id, active.id, "Publication superseded during delivery");
  assert.equal(soleVersion(delivered[0]), versionId, "Publication version superseded during delivery");
  verifiedSource(revision);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Vanity production\n\nRevision: \`${revision}\`\n\n[Worker deployment ${active.id}](${deploymentUrl})\n\nActive version: \`${versionId}\` at 100%. Prior deployment retained: \`${previous[0]?.id}\`.\n\nPost-deploy smoke passed: ${results.length} exact public asset checks across both domains.\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && ["--preflight", "--smoke-only"].includes(args[0])),
    "Usage: node scripts/deploy.mjs [--preflight | --smoke-only]; unsupported arguments");
  const revision = process.env.SOURCE_SHA ?? process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert.match(revision, /^[a-f0-9]{40}$/, "A full Git revision is required");
  if (args[0] === "--smoke-only") await smoke(revision);
  else {
    const temporary = mkdtempSync(join(tmpdir(), "vanity-deploy-"));
    try {
      const directory = join(temporary, "public");
      mkdirSync(directory);
      for (const [path, bytes] of publicArtifact(revision)) {
        const file = join(directory, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, bytes);
      }
      const invocation = deploymentArgs(directory, revision);
      await preflight(revision, directory, invocation);
      if (args[0] !== "--preflight") await deploy(revision, invocation);
    } finally {
      rmSync(temporary, { recursive: true });
    }
  }
}
