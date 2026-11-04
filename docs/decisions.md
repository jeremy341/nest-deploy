# Decision log

Newest decisions are at the bottom. Each entry says what was decided and why. When a decision changes, add a new entry rather than rewriting the old one.

1. **Website, not a CLI.** The first version is a website where users sign in, connect a Nest server and GitHub, and deploy and manage projects. The CLI-first plan from the original idea was dropped.
2. **Version 1 is the full scope in `planning/02-decided-feature-scope.md`.** It includes traffic analytics, previews, custom domain automation, multiple runtimes, team access, and advanced monitoring. The user chose to keep everything in Version 1 after we suggested a pilot-first cut.
3. **Sign-in with Hack Club Auth.** Hack Club Auth identifies the user only. It doesn't grant access to their Nest container. Hackatime OAuth is a later option for hours tracking.
4. **Connect Nest with a dedicated SSH key.** The site generates an ed25519 key. The user pastes the public key into the Nest dashboard's SSH Keys page and clicks Test connection. The site then runs `ssh <nest-username>@hackclub.app`.
5. **The stored key grants root.** The bastion logs in to the container as root, so the site's key is effectively root on the user's container. The user accepted this. Users can revoke the key in the Nest dashboard at any time. The Decided Feature Scope documents this.
6. **Manual key paste for now.** No public API exists for SSH keys, and we decided not to reverse-engineer the dashboard's requests. The paste stays manual until Nest offers an API.
7. **Build outside Nest.** Nest containers are small (2 vCPUs, 2 GB RAM). Builds should run on our own workers, and only the finished artifact goes to Nest. This is planned, not yet tested.
8. **Docker considered, not decided.** A Docker image pins the runtime and dependencies. Rootless Docker inside a Nest container is unverified, so Docker versus plain release directories is still open.
9. **Repo created and made public.** The repo is `jeremy341/nest-deploy`. The folder name has a space, but the repo name uses a hyphen because GitHub doesn't allow spaces.

## Superseded or inconsistent text in the planning docs

- `planning/01-original-idea.md` still describes an agent running in each user's container in its architecture section. Decision 4 replaces it with the SSH key flow. Update that section when the architecture is finalized.
- The planning documents keep their original `[[wiki links]]`. They don't resolve on GitHub, so treat them as plain references to the notes they name.
