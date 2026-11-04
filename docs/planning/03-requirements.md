# Nest Deploy Requirements

Status: product proposal, not an implementation or a claim of Nest support. Research snapshot: 28 October 2026. Related: [[Nest - Deploy]] · [[Vercel Feature Inventory]] · [[UI and Design Inspiration]].

## Product goal

A shared website provides a smooth Vercel-inspired experience for people who connect their own Nest containers. Each server has an independent workspace; each application stays in the user's environment. The shared control plane must itself be operated and secured. Aim for compatibility with existing Nest workflows and possible future adoption, subject to maintainer interest.

## Priority key

- **P0** — needed for a credible private pilot or a safe basic workflow.
- **P1** — required for the desired smooth everyday experience after the pilot.
- **P2** — valuable expansion once the foundations work.
- **Explore** — advanced or dependent on Nest, third parties or dedicated infrastructure. Retain as an aspiration; no commitment to parity yet.

## 1. Accounts and onboarding

- **P0:** account sign-in; ownership checks on all server and project data; session management and logout; readable errors; user-controlled disconnect.
- **P0:** guided agent install/pairing with short-lived one-time pairing, expiry, replay prevention and explicit server identity; reconnect and revoke; setup diagnostics and uninstall instructions.
- **P1:** GitHub account and GitHub App installation, selecting repositories, permission explanation and revocation; one clear import/deploy wizard.
- **P1:** onboarding progress, prerequisites and troubleshooting for supported Nest configurations; accessibility and responsive dashboard.
- **P2:** account recovery, notifications and onboarding for multiple servers.
- **Explore:** official Nest identity or account integration only if supported and approved by maintainers; team invitations, roles and audit controls.

## 2. Server workspaces

- **P0:** one server workspace per connected container with clear online/offline status, agent version and last contact; projects scoped to that server.
- **P0:** manual connection repair, agent removal, stale-state indication and clear distinction between Nest Deploy availability and app availability.
- **P1:** multiple independently paired server workspaces; switch, rename and disconnect; explicitly show which workspace a project belongs to.
- **P1:** overview of managed apps, process state, current deployments, resource trends and alerts where data is available.
- **P2:** read-only discovery of existing services where supported; explicit opt-in adoption, with no automatic takeover or destructive configuration changes.
- **Explore:** Nest dashboard features and APIs, quota, domain and service integration as permitted; user-to-server sharing or server grouping.

## 3. Projects and configuration

- **P0:** create/import, list and inspect projects; source repository, branch, server, root directory, runtime, build/start commands, port and health-check settings.
- **P0:** explicit supported Node.js app profile; validate configuration, paths and inputs; explain unsupported applications.
- **P0:** secret and environment-variable handling with restricted access, encryption in transit and at rest as applicable, redaction and safe edits; never display values in logs by default.
- **P1:** archive/delete a project with clear options for preserving source, releases, data and other services; environment-specific settings; convenient framework detection with user override.
- **P2:** static sites, Python, additional runtimes and monorepo subdirectories; templates, scheduled jobs and background workers as individually validated profiles.
- **Explore:** containers only if Nest supports the required configuration; microfrontends and other frameworks with specific compatibility tests.

## 4. Git, builds and deployments

- **P0:** deploy a chosen authorized commit manually, record repository, immutable commit, timestamps and actor; show queued/building/success/failure and stream build logs.
- **P0:** serialize jobs per project; handle retries and duplicates safely, timeouts, cancellation, disk exhaustion, interrupted builds and disconnects; prevent concurrent changes from corrupting releases.
- **P0:** build in a separate release directory, start a candidate, check it, retain the current working release on failure, and show actionable errors; retain and clean releases using bounded policies.
- **P0:** run projects and build scripts with least privilege and separate identities where possible. Treat source and dependencies as arbitrary code; confirm actual isolation and never claim stronger guarantees than tested.
- **P1:** GitHub App installation with minimum repository permissions; verified webhooks, event deduplication, branch selection and automatic deployment on push; authorization checked when events and jobs run.
- **P1:** deployment history, manual redeploy, cancel, retention controls, commit links, application logs and clear restart/service states.
- **P1:** restore a retained release with compatibility warning and observable result; test switching and recovery. This does not change Git history or reverse database migrations; rebuilding an old commit is a different action.
- **P2:** pull-request previews with cleanup, resource limits and access protection; production promotion and optional approval/check gates; deployment notifications and deploy hooks.
- **Explore:** zero-downtime or rolling releases, immutable artifacts, build caching and additional Git providers only after compatibility and resource validation.

## 5. Routing and domains

- **P0:** document the supported way to expose one application and test its health; never modify shared Nest infrastructure without authorization.
- **P1:** guided domain and HTTPS setup using Nest-supported mechanisms, conflict detection and understandable diagnostics; show status and link to manual steps when automation is unavailable.
- **P2:** custom domains, redirects, multiple routes and preview domains where supported; renewal status.
- **Explore:** CDN, edge routing, traffic splitting, global availability and managed certificates only through verified infrastructure or integrations; no Vercel-equivalent claims by default.

## 6. Server and application observability

- **P0:** agent heartbeat and project status; timestamps and indication that metrics may be unavailable or stale; CPU, memory and disk for the container where accessible.
- **P0:** bounded, redacted build/runtime logs; local and central retention limits; process exit reason and failed health checks.
- **P1:** time-series charts, disk pressure, per-project process metrics where attribution is reliable, deployment timeline, search/filter logs and uptime checks.
- **P1:** user-configurable failure and resource alerts with deduplication and clear thresholds; show current vs historical measurements and units.
- **P2:** traffic/request/error/latency charts through an explicit proxy or analytics provider; visit counts, unique-visitor definitions, privacy choices, retention and consent requirements as applicable.
- **Explore:** browser performance metrics, custom events, distributed tracing, log drains, dashboards and external alert integrations; choose data sources before claiming support.

## 7. Security and operations

- **P0:** threat model for account compromise, server pairing, cross-user access, untrusted builds, credential theft, webhook abuse and compromised agents; security review before wider pilot.
- **P0:** authenticated encrypted control-plane/agent communication; expiring scoped agent credentials, per-server authorization, rotation/revocation, integrity-checked updates and no arbitrary remote shell by default.
- **P0:** least-privilege system users, sandbox/isolation feasibility, limits on builds/processes/storage/logs, secure secret storage, CSRF and session protections, signed webhook validation and audit events.
- **P0:** control-plane monitoring, backups and restore tests, incident response, service health, version compatibility and recovery after agent/network/control-plane failure.
- **P1:** update and rollback strategy for agents, user-facing security controls, deletion/export of account data, access logs and clear privacy/retention documentation.
- **P2:** MFA, user-visible audit history, granular project roles, security alerts and encrypted backup workflows as appropriate.
- **Explore:** WAF, DDoS and bot protection through existing approved services; enterprise SSO/compliance only when independently implemented and verified.

## 8. Developer experience and ecosystem

- **P0:** documented install, supported app example, sample configuration, troubleshooting, recovery and support channel; versioned protocol and reproducible test environments.
- **P1:** dashboard API for its own frontend, GitHub commit/status links and tested update/uninstall paths; clear boundaries between user and platform responsibilities.
- **P2:** documented public API, CLI, integrations with [[Hack Club CLI]] and [[Hackclub Components]], deploy hooks, templates and export/import.
- **Explore:** feature flags, marketplace, AI integrations and MCP; investigate actual demand instead of assuming they are prerequisites.

## 9. Vercel capability mapping

| Vercel area | Proposed Nest Deploy approach | Stage and constraint |
| --- | --- | --- |
| Git, builds, deployments, CLI | GitHub App, release builder, deploy history, optional CLI | P0–P2; runtime and Nest compatibility |
| Preview, promotion, rollback, rolling releases | retained release rollback first; preview and promotion later | P1–Explore; ports, routing, disk, database compatibility |
| Domains, routing, CDN | Nest-supported routing and domain workflow | P0–Explore; central Nest permissions and external services |
| Functions, Fluid Compute, queues, daemons, cron | long-running supported processes first; jobs later | P0–Explore; no assumed serverless or autoscaling parity |
| Storage, integrations, registry | external integrations or user-managed services | P2–Explore; providers, credentials, backups and costs |
| Logs, tracing, analytics, Speed Insights | logs and container metrics first; traffic integration later | P0–Explore; data sources, retention, privacy |
| Toolbar, flags, checks | consider feedback, flags and deployment checks | P2–Explore; user demand and separate integrations |
| Firewall, bots, protection, identity | secure control plane and optionally integrate approved protections | P0–Explore; not equivalent to Vercel's network security |
| Accounts, teams, billing, support | individual accounts and workspace ownership; teams later | P0–Explore; operator costs and support capacity |
| AI Gateway, AI SDK, v0, AI agents, MCP | links or integrations where useful | Explore; separate products, not core deployment prerequisites |
| Platforms, microfrontends, enterprise networking/compliance | investigate only with concrete use cases and partners | Explore; substantial platform or organizational dependencies |

## 10. Validation and decisions before building

1. Confirm Nest policies, user privileges, agent persistence, outbound connectivity, process management, routing, domain setup, quotas and permitted build isolation with current Nest guides and maintainers. [Nest](https://hackclub.app/) · [Nest setup](https://github.com/hackclub/nest/blob/main/SETUP.md).
2. Prototype pairing and one manual deploy in a disposable user environment, including a failed build and recovery. Measure installation time, CPU, memory and disk impact.
3. Test GitHub installation permissions and webhook verification; confirm behavior when access is revoked. [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).
4. Test restart, secret redaction, release retention and rollback with an app that includes a database migration; document what cannot be rolled back.
5. Test with a few Nest users and ask maintainers whether the design fits Nest's infrastructure and support model.

## Pilot acceptance

A user can pair one supported server, deploy a documented sample from a chosen commit, inspect status and logs, recover from a failed deployment, and disconnect the agent. Unauthorized accounts cannot access that server or its projects. A separate basic resource view reports available metrics honestly. This is the pilot gate; automatic GitHub deployment and full server analytics belong to the subsequent everyday-use milestone.

## Release split

The agreed scope is divided into [[Nest Deploy Decided Feature Scope#Version 1 private Nest deployment dashboard|Version 1]] and [[Nest Deploy Decided Feature Scope#Version 2 expanded platform and integrations|Version 2]]. Version 1 includes traffic analytics, previews, custom domain automation, multiple common runtimes, team access and advanced monitoring, subject to verifying data sources, routing, and Nest limits. Version 2 focuses on broader providers, integrations and scaling beyond that full first product. The implementation stages below are working sequencing notes and should be read with this release split.

