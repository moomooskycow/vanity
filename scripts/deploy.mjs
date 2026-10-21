import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { changelog } from "./changelog.mjs";

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
    "--tag", revision, "--message", `Git revision ${revision}; attempt ${randomUUID()}`,
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
  const results = await readDelivery(revision, targets, Date.now() + 60_000, [...artifact.keys()]);
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

async function api(path, payload) {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/vanity${path}`, {
    method: payload ? "POST" : "GET",
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN.trim()}`, "content-type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok, `Cloudflare ${payload ? "POST" : "GET"} ${path}: HTTP ${response.status}`);
  const body = await response.json();
  assert.equal(body.success, true, "Cloudflare API rejected version lookup");
  return body.result;
}

function soleVersion(deployment) {
  assert.ok(deployment?.id, "Missing active deployment identity");
  assert.equal(deployment.versions.length, 1, "Expected one active production version");
  assert.equal(deployment.versions[0].percentage, 100, "Production version is not fully active");
  assert.ok(deployment.versions[0].version_id, "Missing active version identity");
  return deployment.versions[0].version_id;
}

function compatible(revision, priorRevision, version) {
  // This release unit has no state or migrations. Fail closed if that changes,
  // including a provider-only binding or a Worker/configuration source change.
  for (const path of ["worker.js", "wrangler.jsonc"]) {
    const source = (sha) => execFileSync("git", ["show", `${sha}:${path}`], { cwd: root });
    assert.deepEqual(source(priorRevision), source(revision), `Rollback compatibility unproven: ${path}`);
  }
  assert.deepEqual(version.resources.bindings, [{ name: "ASSETS", type: "assets" }],
    "Rollback requires the stateless assets-only Worker");
}

async function restore(revision, priorRevision, priorId, candidate) {
  if (!candidate) return { status: "skipped", reason: "candidate identity unproven" };
  // No force and no mutation retry: provider compatibility rejection or an
  // ambiguous POST must stay loud. CI serializes the sole publication path.
  const { deployments } = await api("/deployments");
  const current = deployments[0];
  if (current?.id !== candidate.id || soleVersion(current) !== soleVersion(candidate)) {
    return { status: "skipped", reason: "candidate superseded" };
  }
  const restored = await api("/deployments", {
    strategy: "percentage",
    versions: [{ version_id: priorId, percentage: 100 }],
    annotations: { "workers/message": `Automatic recovery of failed ${revision}` },
  });
  assert.equal(soleVersion(restored), priorId, "Rollback response version mismatch");
  const { deployments: readback } = await api("/deployments");
  assert.equal(readback[0]?.id, restored.id, "Rollback deployment superseded or unconfirmed");
  assert.equal(soleVersion(readback[0]), priorId, "Rollback active version mismatch");
  const version = await api(`/versions/${priorId}`);
  assert.equal(version.annotations["workers/tag"], priorRevision, "Rollback source revision mismatch");
  // Unlike publication, recovery never tolerates failed candidate bytes or errors.
  await smoke(priorRevision);
  const { deployments: final } = await api("/deployments");
  assert.equal(final[0]?.id, restored.id, "Rollback superseded during delivery verification");
  assert.equal(soleVersion(final[0]), priorId, "Rollback final version mismatch");
  return { status: "restored", deployment: restored.id, version: priorId, revision: priorRevision };
}

function summary(message) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, message); }
  catch { console.error("Could not write deployment summary; inspect deployment diagnostics"); }
}

export async function deploy(revision, args) {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  const [master] = execFileSync("git", ["ls-remote", "origin", "refs/heads/master"], { cwd: root, encoding: "utf8", timeout: 30_000 }).split(/\s/);
  assert.equal(master, revision, "Source revision is no longer master; the newer merge owns deployment");
  const { deployments: previous } = await api("/deployments");
  const priorId = soleVersion(previous[0]);
  const priorVersion = await api(`/versions/${priorId}`);
  assert.equal(priorVersion.id, priorId, "Prior version identity mismatch");
  const priorRevision = priorVersion.annotations["workers/tag"];
  const priorArtifact = publicArtifact(priorRevision);
  compatible(revision, priorRevision, priorVersion);
  // Prove that the recovery target was healthy before mutation. A 200 alone
  // remains sufficient only for observing the strict publication transition.
  await smoke(priorRevision);
  const paths = [...publicArtifact(revision).keys()];
  const absent = new Set(domains.flatMap((domain) => paths.filter((path) => !priorArtifact.has(path)).map((path) => `${domain}/${path}`)));
  const priorDelivery = await readDelivery(revision, domains, Date.now() + 60_000, paths, absent);
  const { deployments: before } = await api("/deployments");
  assert.equal(before[0]?.id, previous[0].id, "Prior deployment changed before publication");
  assert.equal(soleVersion(before[0]), priorId, "Prior version changed before publication");
  let candidate;
  let published;
  let publicationFailure;
  const messageIndex = args.lastIndexOf("--message");
  assert.ok(messageIndex >= 0, "Native publication attempt message is required");
  const attempt = args[messageIndex + 1];
  assert.match(attempt, new RegExp(`^Git revision ${revision}; attempt [a-f0-9-]{36}$`), "Native publication attempt message is invalid");
  const receiptDirectory = mkdtempSync(join(tmpdir(), "vanity-publication-"));
  const receiptPath = join(receiptDirectory, "wrangler.jsonl");
  try {
    // A source tag is not job ownership. Wrangler's private per-invocation
    // receipt proves the exact version; the random attempt message correlates
    // the active deployment with this invocation, including same-SHA releases.
    try {
      execFileSync(process.execPath, args, {
        cwd: root, stdio: "inherit", timeout: 120_000,
        env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: receiptPath },
      });
    } catch (error) { publicationFailure = error; }
    let receipt;
    try {
      const entries = readFileSync(receiptPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      const publications = entries.filter((entry) => entry.type === "deploy");
      assert.equal(publications.length, 1, "Expected one native publication receipt");
      receipt = publications[0];
      assert.equal(receipt.version, 1, "Unsupported native publication receipt");
      assert.equal(receipt.worker_name, "vanity", "Native publication receipt target mismatch");
      assert.match(receipt.version_id, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, "Native publication version identity unproven");
    } catch (error) {
      throw new Error(`Native publication identity unproven: ${error.message}`, { cause: error });
    }
    const { deployments } = await api("/deployments");
    const active = deployments[0];
    const versionId = soleVersion(active);
    assert.equal(versionId, receipt.version_id, "Candidate version superseded before readback");
    assert.equal(active.annotations?.["workers/message"], attempt, "Candidate deployment superseded before readback");
    const version = await api(`/versions/${versionId}`);
    assert.equal(version.id, versionId, "Candidate version identity mismatch");
    assert.equal(version.annotations["workers/tag"], revision, "Cloudflare published a different source revision");
    assert.notEqual(active.id, previous[0].id, "Candidate activation unproven");
    candidate = active;
    if (publicationFailure) throw publicationFailure;
    console.log(JSON.stringify({ revision, deployment: active.id, version: versionId, previous: previous[0].id }));
    const results = await awaitDelivery(revision, priorDelivery);
    const { deployments: delivered } = await api("/deployments");
    assert.equal(delivered[0]?.id, candidate.id, "Candidate deployment superseded during delivery");
    assert.equal(soleVersion(delivered[0]), versionId, "Candidate version superseded during delivery");
    published = { revision, deployment: active.id, version: versionId, checks: results.length };

  } catch (failure) {
    let rollback;
    try { rollback = await restore(revision, priorRevision, priorId, candidate); }
    catch (error) { rollback = { status: "unconfirmed", reason: error.message }; }
    console.error(JSON.stringify({ revision, publication: "failed", rollback }));
    const original = publicationFailure ?? failure;
    const verification = publicationFailure && failure !== publicationFailure ? `; verification failed: ${failure.message}` : "";
    summary(`Vanity publication failed: ${original.message}${verification}\nRollback: ${JSON.stringify(rollback)}\n`);
    throw new Error(`Publication failed: ${original.message}${verification}; rollback ${rollback.status}: ${rollback.reason ?? rollback.deployment}`, { cause: original });
  } finally {
    rmSync(receiptDirectory, { recursive: true, force: true });
  }
  summary(`Vanity production: ${published.revision}; deployment ${published.deployment}; version ${published.version} at 100%. Smoke: ${published.checks} exact public asset checks.\n`);
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
