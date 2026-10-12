import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const html = await readFile(resolve(repositoryRoot, "apps/portal/src/index.html"), "utf8");
const accessLog = await readFile(resolve(repositoryRoot, "ops/nginx-access-log.conf"), "utf8");
const nginxServer = await readFile(resolve(repositoryRoot, "ops/nginx.conf"), "utf8");
const portalDockerfile = await readFile(resolve(repositoryRoot, "apps/portal/Dockerfile"), "utf8");
const platformDockerfile = await readFile(resolve(repositoryRoot, "apps/platform/Dockerfile"), "utf8");
const script = html.match(/<script id="stripe-return-query-cleanup">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "portal head must contain early Stripe return query cleanup");

function cleanUrl(initialUrl) {
  const parsed = new URL(initialUrl);
  let replacedUrl = null;
  const window = {
    location: { search: parsed.search, pathname: parsed.pathname, hash: parsed.hash },
    history: {
      state: { navigationId: 7 },
      replaceState(_state, _title, url) {
        replacedUrl = url;
      },
    },
  };
  runInNewContext(script, { URLSearchParams, window });
  return replacedUrl;
}

test("cleans Stripe callback query before app scripts and preserves application query", () => {
  assert.equal(cleanUrl("https://portal.example/wallet?draftId=draft-1&payment_intent=pi_1&payment_intent_client_secret=pi_secret_1&redirect_status=succeeded&view=ledger#balance"),
    "/wallet?draftId=draft-1&view=ledger#balance");
});

test("leaves ordinary application URLs untouched", () => {
  assert.equal(cleanUrl("https://portal.example/requests?draftId=draft-1#form"), null);
});

test("runs cleanup before runtime configuration", () => {
  assert.ok(html.indexOf('id="stripe-return-query-cleanup"') < html.indexOf('src="runtime-config.js"'));
});

test("access log records path without query or referrer", () => {
  assert.match(accessLog, /\$uri/);
  assert.doesNotMatch(accessLog, /\$(?:request|args|http_referer)\b/);
  assert.match(nginxServer, /access_log \/var\/log\/nginx\/access\.log nexa_redacted;/);
  assert.match(portalDockerfile, /COPY ops\/nginx-access-log\.conf \/etc\/nginx\/conf\.d\/00-access-log\.conf/);
  assert.match(platformDockerfile, /COPY ops\/nginx-access-log\.conf \/etc\/nginx\/conf\.d\/00-access-log\.conf/);
});
