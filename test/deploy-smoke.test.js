const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createServer } = require("node:http");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("production smoke rejects stale assets and error responses even with matching content", async (t) => {
  const { smoke } = await import("../scripts/deploy.mjs");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  let mode = "valid";
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = pathname === "/" ? "index.html" : pathname.slice(1);
    const bytes = execFileSync("git", ["show", `${revision}:${file}`], { cwd: root });
    if (mode === "stale" && file === "quotes.js") {
      response.end('window.QUOTES = [["Old", "release"]];\n');
    } else {
      response.statusCode = mode === "error" ? 404 : 200;
      response.end(bytes);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const target = `http://127.0.0.1:${server.address().port}`;

  await smoke(revision, [target]);
  mode = "stale";
  await assert.rejects(smoke(revision, [target]), /Smoke revision mismatch.*quotes\.js/);
  mode = "error";
  await assert.rejects(smoke(revision, [target]), /Smoke HTTP failure/);
});

test("malformed deployment invocations fail before revision, authentication, or mutation", () => {
  for (const args of [
    ["--dry-run"],
    ["deploy"],
    ["--preflight", "stray"],
    ["--preflight", "--preflight"],
    ["--preflight", "--smoke-only"],
    ["--smoke-only", "--unknown"],
  ]) {
    const result = spawnSync(process.execPath, ["scripts/deploy.mjs", ...args], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, DIGITALOCEAN_API_TOKEN: "", GITHUB_SHA: "invalid" },
      timeout: 5000,
    });
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /Usage: node scripts\/deploy\.mjs/);
    assert.doesNotMatch(result.stderr, /full Git revision|DIGITALOCEAN_API_TOKEN is required/);
    assert.equal(result.stdout, "");
  }
});

test("edge readiness allows only observed old bytes until exact new delivery, and fails closed otherwise", async (t) => {
  const { createHash } = require("node:crypto");
  const { awaitDelivery } = await import("../scripts/deploy.mjs");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const oldQuote = 'window.QUOTES = [["Prior", "published quote"]];\n';
  let mode = "transition";
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = pathname === "/" ? "index.html" : pathname.slice(1);
    if (mode === "error") {
      response.statusCode = 503;
      response.end(oldQuote);
    } else if (file === "quotes.js" && mode !== "new") {
      response.end(mode === "unknown" ? "unrecognized content" : oldQuote);
      if (mode === "transition") mode = "new";
    } else {
      response.end(execFileSync("git", ["show", `${revision}:${file}`], { cwd: root }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const target = `http://127.0.0.1:${server.address().port}`;
  const prior = [{ domain: target, path: "quotes.js", sha256: createHash("sha256").update(oldQuote).digest("hex") }];

  const ready = await awaitDelivery(revision, prior, [target], 5000);
  const deliveredQuote = ready.find((result) => result.path === "quotes.js");
  const newQuote = execFileSync("git", ["show", `${revision}:quotes.js`], { cwd: root });
  assert.equal(deliveredQuote.sha256, createHash("sha256").update(newQuote).digest("hex"));

  mode = "unknown";
  await assert.rejects(awaitDelivery(revision, prior, [target], 5000), /Unexpected edge content/);
  mode = "error";
  await assert.rejects(awaitDelivery(revision, prior, [target], 5000), /Smoke HTTP failure/);
  mode = "old";
  await assert.rejects(awaitDelivery(revision, prior, [target], 50), /Healthy edge convergence timed out/);
});
