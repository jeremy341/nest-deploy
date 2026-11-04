# Nest Deploy

A Vercel-style dashboard for deploying projects to [Hack Club Nest](https://guides.hackclub.app) servers.

**Status:** early planning. Nothing is implemented yet.

## Start here

1. [docs/decisions.md](docs/decisions.md): what has been decided, and why.
2. [docs/nest-research.md](docs/nest-research.md): how Nest works (SSH, the bastion, containers, networking, acceptable use), and what is still unverified.
3. [docs/planning/02-decided-feature-scope.md](docs/planning/02-decided-feature-scope.md): the Version 1 scope.

The other planning files are the research and history behind those decisions.

## Planned

- Sign in with Hack Club Auth
- Connect a Nest server with a dedicated SSH key, added in the Nest dashboard
- Connect GitHub repositories
- Deploy, view logs, and roll back projects on Nest

## Code

The web app is in [web/](web/). Its README covers the stack, design rules, and how to run it.

## Not in this repo

The raw Vercel documentation captures and the full feature catalogs (about 17 MB) stay in the planning vault. Add them here if they're needed.
