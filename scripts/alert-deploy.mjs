import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const dsn = new URL(process.env.SENTRY_DSN);
const project = dsn.pathname.slice(1);
const endpoint = new URL(`/api/${project}/store/`, dsn);
endpoint.username = "";
endpoint.password = "";
const eventId = randomUUID().replaceAll("-", "");
const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const probe = process.env.ALERT_PROBE === "yes";
// Deliberately narrow: never send provider responses, credentials, page content,
// local paths, or user records. The Actions run owns the detailed diagnostics.
const event = {
  event_id: eventId,
  timestamp: Date.now() / 1000,
  platform: "node",
  level: "error",
  logger: "vanity.deploy",
  release: process.env.GITHUB_SHA,
  environment: "production",
  exception: { values: [{
    type: "VanityDeploymentFailure",
    value: probe ? "Controlled Vanity deployment alert probe; production unchanged" : "Vanity production pipeline failed; inspect the Actions run",
  }] },
  fingerprint: ["vanity-deploy", process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT],
  tags: { repository: "moomooskycow/vanity", alert_route_probe: probe ? "yes" : "no" },
  extra: { run_url: runUrl, check_result: process.env.CHECK_RESULT, deploy_result: process.env.DEPLOY_RESULT },
};
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-sentry-auth": `Sentry sentry_version=7, sentry_client=vanity-deploy/1, sentry_key=${dsn.username}`,
  },
  body: JSON.stringify(event),
  signal: AbortSignal.timeout(30_000),
});
assert.ok(response.ok, `Agent alert ingestion failed: HTTP ${response.status}`);
const accepted = await response.json();
assert.equal(accepted.id, eventId, "Sentry did not acknowledge the expected event");
console.log(JSON.stringify({ event_id: eventId, project: "misty-step/vanity", destination: "kaylee-alert-intake", probe, run_url: runUrl }));
