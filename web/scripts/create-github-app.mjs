// Create the Nest Deploy GitHub App for this machine, without copying secrets by hand.
//
//   node scripts/create-github-app.mjs
//
// GitHub only lets an app be created from a browser form, so this runs a tiny
// local page that submits the app's settings (a "manifest") to GitHub. You click
// one button on GitHub. GitHub then sends the browser back here with a one-time
// code, which this script exchanges for the app's credentials and writes them
// into web/.env.local. Secrets are never printed.
//
// Requires: the gh CLI is not needed; only a browser and this machine's network.

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "..", ".env.local");
const PORT = 4123;
const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const STATE = randomBytes(16).toString("hex");

const manifest = {
  name: `Nest Deploy (${process.env.USER ?? process.env.USERNAME ?? "local"}-${STATE.slice(0, 4)})`,
  url: APP_URL,
  description: "Deploys GitHub repositories to a Hack Club Nest container.",
  public: false,
  // No hook_attributes: GitHub refuses localhost hook URLs, so the webhook is set up later.
  redirect_url: `http://localhost:${PORT}/callback`,
  callback_urls: [`${APP_URL}/api/github/callback`],
  setup_url: `${APP_URL}/api/github/callback`,
  setup_on_update: true,
  request_oauth_on_install: true,
  default_permissions: {
    contents: "read",
    metadata: "read",
    pull_requests: "write",
  },
  default_events: ["push", "pull_request"],
};

function page() {
  const body = JSON.stringify(manifest).replace(/</g, "\\u003c");
  return `<!doctype html>
<meta charset="utf-8">
<title>Create the Nest Deploy GitHub App</title>
<body style="font-family: system-ui; max-width: 36rem; margin: 3rem auto; line-height: 1.5">
<h1>Create the GitHub App</h1>
<p>This sends the Nest Deploy app settings to GitHub. You will see GitHub's own page with the name and permissions. Press <b>Create GitHub App</b> there.</p>
<form id="f" method="post" action="https://github.com/settings/apps/new?state=${STATE}">
  <input type="hidden" name="manifest" value="">
  <button type="submit" style="font-size: 1rem; padding: 0.5rem 1rem">Continue to GitHub</button>
</form>
<script>
  const manifest = ${body};
  const f = document.getElementById("f");
  f.elements.manifest.value = JSON.stringify(manifest);
  f.submit();
</script>
</body>`;
}

function writeEnv(values) {
  const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const keys = Object.keys(values);
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const key = keys.find((k) => line.startsWith(`${k}=`));
    if (key) {
      out.push(`${key}=${values[key]}`);
      seen.add(key);
    } else {
      out.push(line);
    }
  }
  for (const k of keys) if (!seen.has(k)) out.push(`${k}=${values[k]}`);
  while (out.length && out[out.length - 1] === "") out.pop();
  writeFileSync(envPath, out.join("\n") + "\n");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page());
    return;
  }

  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || state !== STATE) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("That link is not valid. Run the script again.");
      return;
    }
    try {
      const r = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
        method: "POST",
        headers: { accept: "application/vnd.github+json", "user-agent": "nest-deploy-setup" },
      });
      if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
      const app = await r.json();
      writeEnv({
        GITHUB_APP_ID: String(app.id),
        GITHUB_APP_SLUG: app.slug,
        GITHUB_APP_CLIENT_ID: app.client_id,
        GITHUB_APP_CLIENT_SECRET: app.client_secret,
        GITHUB_APP_PRIVATE_KEY: String(app.pem).replace(/\r?\n/g, "\\n"),
        GITHUB_WEBHOOK_SECRET: app.webhook_secret ?? "",
      });
      console.log(`Created app ${app.slug} (id ${app.id}). Credentials written to web/.env.local.`);
      console.log(`Next: install it on your account and choose the nest-deploy repo: ${app.html_url}/installations/new`);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<body style="font-family: system-ui; max-width: 36rem; margin: 3rem auto"><h1>Done</h1><p>The app was created and its credentials were saved. You can close this tab and go back to the terminal.</p><p><a href="${app.html_url}/installations/new">Install it on your account</a></p></body>`);
      setTimeout(() => server.close(() => process.exit(0)), 300);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("GitHub did not return the app. Check the terminal and try again.");
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Open http://localhost:${PORT} in your browser and press Continue to GitHub.`);
});
