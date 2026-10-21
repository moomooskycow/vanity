const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createServer } = require("node:http");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("production smoke rejects stale assets and error responses even with matching content", async (t) => {
  const { smoke, publicArtifact } = await import("../scripts/deploy.mjs");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const artifact = publicArtifact(revision);
  let mode = "valid";
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = pathname === "/" ? "index.html" : pathname === "/changelog" ? "changelog.html" : pathname.slice(1);
    const bytes = artifact.get(file);
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

test("the explicit PR source wins over GitHub's reserved merge revision", () => {
  const result = spawnSync(process.execPath, ["scripts/deploy.mjs", "--smoke-only"], {
    cwd: root, encoding: "utf8", timeout: 5000,
    env: { ...process.env, SOURCE_SHA: "invalid-source", GITHUB_SHA: "a".repeat(40) },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /A full Git revision is required/);
  assert.doesNotMatch(result.stderr, /Smoke HTTP|fetch failed/);
});

test("only a new path's exact observed prior 404 may remain pending, never count as success", async (t) => {
  const { createHash } = require("node:crypto");
  const { awaitDelivery, publicArtifact, smoke } = await import("../scripts/deploy.mjs");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const artifact = publicArtifact(revision);
  let mode = "transition";
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = pathname === "/" ? "index.html" : pathname === "/changelog" ? "changelog.html" : pathname.slice(1);
    if (file === "changelog.html" && mode !== "new") {
      response.statusCode = mode === "error" ? 503 : 404;
      response.end(mode === "unknown" ? "unobserved missing content" : "");
      if (mode === "transition") mode = "new";
    } else if (file === "index.html" && mode === "missing-existing") {
      response.statusCode = 404; response.end();
    } else response.end(artifact.get(file));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const target = `http://127.0.0.1:${server.address().port}`;
  const previous = [{ domain: target, path: "changelog.html", httpStatus: 404, sha256: createHash("sha256").update("").digest("hex") }];
  assert.equal((await awaitDelivery(revision, previous, [target], 5000)).every(r => r.httpStatus === 200), true);
  mode = "unknown";
  await assert.rejects(awaitDelivery(revision, previous, [target], 5000), /Unexpected edge content/);
  mode = "missing-existing";
  await assert.rejects(awaitDelivery(revision, previous, [target], 5000), /Smoke HTTP failure.*index.html/);
  mode = "error";
  await assert.rejects(awaitDelivery(revision, previous, [target], 5000), /Smoke HTTP failure/);
  mode = "absent";
  await assert.rejects(smoke(revision, [target]), /Smoke HTTP failure/);
});

test("edge readiness allows only observed old bytes until exact new delivery, and fails closed otherwise", async (t) => {
  const { createHash } = require("node:crypto");
  const { awaitDelivery, publicArtifact } = await import("../scripts/deploy.mjs");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const artifact = publicArtifact(revision);
  const oldQuote = 'window.QUOTES = [["Prior", "published quote"]];\n';
  let mode = "transition";
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = pathname === "/" ? "index.html" : pathname === "/changelog" ? "changelog.html" : pathname.slice(1);
    if (mode === "error") {
      response.statusCode = 503;
      response.end(oldQuote);
    } else if (file === "quotes.js" && mode !== "new") {
      response.end(mode === "unknown" ? "unrecognized content" : oldQuote);
      if (mode === "transition") mode = "new";
    } else {
      response.end(artifact.get(file));
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
});

test("readiness deadline and transport abort reject independently of request timing", async (t) => {
  const { createHash } = require("node:crypto");
  const { awaitDelivery, publicArtifact } = await import("../scripts/deploy.mjs");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const artifact = publicArtifact(revision);
  const target = "http://127.0.0.1:4174";
  for (const [file, status, bytes] of [
    ["quotes.js", 200, 'window.QUOTES = [["Prior", "published quote"]];\n'],
    ["changelog.html", 404, ""],
  ]) {
    await t.test(`observed prior ${status} reaches the convergence deadline`, async (t) => {
      const prior = [{ domain: target, path: file, httpStatus: status, sha256: createHash("sha256").update(bytes).digest("hex") }];
      let now = 0;
      const requested = [];
      t.mock.method(Date, "now", () => now);
      // Isolate the poll deadline from the separately tested transport abort.
      const timeout = t.mock.method(AbortSignal, "timeout", (ms) => {
        assert.equal(ms, 50);
        return new AbortController().signal;
      });
      t.mock.method(globalThis, "fetch", async (url) => {
        const pathname = new URL(url).pathname;
        const path = pathname === "/" ? "index.html" : pathname === "/changelog" ? "changelog.html" : pathname.slice(1);
        requested.push(path);
        if (requested.length === artifact.size) now = 50;
        return new Response(path === file ? bytes : artifact.get(path), { status: path === file ? status : 200 });
      });
      await assert.rejects(awaitDelivery(revision, prior, [target], 50), {
        code: "ERR_ASSERTION", message: "Healthy edge convergence timed out",
      });
      assert.deepEqual(requested, [...artifact.keys()]);
      assert.equal(timeout.mock.callCount(), artifact.size);
    });
  }
  await t.test("native fetch propagates the transport timeout reason", async (t) => {
    const reason = new DOMException("Controlled transport deadline", "TimeoutError");
    const signal = AbortSignal.abort(reason);
    t.mock.method(Date, "now", () => 0);
    const timeout = t.mock.method(AbortSignal, "timeout", (ms) => {
      assert.equal(ms, 50);
      return signal;
    });
    await assert.rejects(awaitDelivery(revision, [], [target], 50), (error) => error === reason);
    assert.equal(timeout.mock.callCount(), 1);
  });
});
