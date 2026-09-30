const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
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
