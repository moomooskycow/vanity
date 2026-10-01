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

function publicArtifact(revision) {
  assert.match(revision, /^[a-f0-9]{40}$/, "A full Git revision is required");
  return new Map(publicFiles.map((path) => [
    path, execFileSync("git", ["show", `${revision}:${path}`], { cwd: root }),
  ]));
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
    const pathname = new URL(incoming.url, "http://localhost").pathname;
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
      trustedMainOnly: ["provider authentication", "current master", "active Worker version tag", "both-domain delivery"],
    }));
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

// Only committed, approved public files are materialized or delivered. Neither
// Daybook nor local drafts, generators, source/config or evidence are uploaded.
async function readDelivery(revision, targets, deadline = Infinity) {
  const results = [];
  for (const domain of targets) {
    for (const path of publicFiles) {
      const url = new URL(path === "index.html" ? "/" : `/${path}`, domain);
      url.searchParams.set("vanity_revision", revision);
      const remaining = deadline - Date.now();
      assert.ok(remaining > 0, "Healthy edge convergence timed out");
      const response = await fetch(url, {
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(30_000, remaining)))),
      });
      assert.equal(response.status, 200, `Smoke HTTP failure: ${domain}/${path}`);
      results.push({ domain, path, sha256: digest(Buffer.from(await response.arrayBuffer())), status: "pass" });
    }
  }
  return results;
}

export async function smoke(revision, targets = domains) {
  const artifact = publicArtifact(revision);
  const results = await readDelivery(revision, targets);
  for (const result of results) {
    assert.equal(result.sha256, digest(artifact.get(result.path)),
      `Smoke revision mismatch: ${result.domain}/${result.path}`);
    console.log(JSON.stringify(result));
  }
  return results;
}

// Readiness after publication, not a generic retry: only the observed HTTP-200
// prior bytes may coexist with exact new bytes. Errors or unknown bytes fail now.
// The URL, headers, status and exact-byte expectations never change between polls.
export async function awaitDelivery(revision, previous, targets = domains, timeoutMs = 60_000) {
  const expected = new Map([...publicArtifact(revision)].map(([path, bytes]) => [path, digest(bytes)]));
  const old = new Map(previous.map((result) => [`${result.domain}/${result.path}`, result.sha256]));
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const results = await readDelivery(revision, targets, deadline);
    const pending = [];
    for (const result of results) {
      if (result.sha256 === expected.get(result.path)) continue;
      assert.equal(result.sha256, old.get(`${result.domain}/${result.path}`),
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

async function deploy(revision, args) {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  const [master] = execFileSync("git", ["ls-remote", "origin", "refs/heads/master"], { cwd: root, encoding: "utf8" }).split(/\s/);
  assert.equal(master, revision, "Source revision is no longer master; the newer merge owns deployment");
  const { deployments: previous } = await api("/deployments");
  const priorDelivery = await readDelivery(revision, domains);
  execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });
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
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Vanity production\n\nRevision: \`${revision}\`\n\n[Worker deployment ${active.id}](${deploymentUrl})\n\nActive version: \`${versionId}\` at 100%. Prior deployment retained: \`${previous[0]?.id}\`.\n\nPost-deploy smoke passed: ${results.length} exact public asset checks across both domains.\n`);
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
