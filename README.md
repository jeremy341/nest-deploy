# Nest Deploy

A Vercel-style dashboard for deploying projects to [Hack Club Nest](https://guides.hackclub.app) servers.

**Status:** working. The dashboard, deploy pipeline, GitHub integration and uptime monitor are built; the roadmap below lists what is not.

## Start here

1. [docs/decisions.md](docs/decisions.md): what has been decided, and why.
2. [docs/nest-research.md](docs/nest-research.md): how Nest works (SSH, the bastion, containers, networking, acceptable use), and what is still unverified.
3. [docs/planning/02-decided-feature-scope.md](docs/planning/02-decided-feature-scope.md): the Version 1 scope.

The other planning files are the research and history behind those decisions.

## What it does

- Sign in with Hack Club Auth
- Connect one or more Nest servers with a dedicated SSH key, added in the Nest dashboard
- Import GitHub repositories; deploy on push, from a deploy hook, or by hand
- Branch previews, health-checked deploys with automatic revert, and rollback to the last five releases
- Build and runtime logs (runtime logs are searchable), environment variables, custom domains
- Restart a service without redeploying
- Uptime checks and usage history: the worker checks each live project and samples server load, memory and disk every 5 minutes (`MONITOR_INTERVAL_MS`, 0 turns it off), and alerts the project's Discord or Slack webhook when an app stops answering and when it recovers
- An Activity page listing changes made to projects, domains and servers
- Per-project memory and CPU history on the project page (systemd accounting for that service only)
- Page-view analytics: a small cookie-free script the owner adds to their site, with daily views, visitors, top pages and referrers. No IP addresses are stored; 90 days of history
- An optional public status page per project (current state, 30-day uptime from the monitor, recent outages)
- An account page: signed-in browsers (sign out one or all), GitHub installations, and account deletion
- Edit a domain's project and port
- Pull-request previews: a same-repository pull request links to its preview, gets one updated comment, and is cleaned up when it closes (forks are never built)

## Not built yet

- Team access (everything belongs to one user)
- Request counts and latency (analytics counts page views reported by the script, not server requests)
- Alerts you can configure beyond the webhook, and per-project disk use

## Code

The web app is in [web/](web/). Its README covers the stack, design rules, and how to run it.

## Not in this repo

The raw Vercel documentation captures and the full feature catalogs (about 17 MB) stay in the planning vault. Add them here if they're needed.
