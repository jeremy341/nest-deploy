# Nest Deploy: Decided Feature Scope

This document resolves the earlier **Could need** list against the product you described: a polished web dashboard for each person’s Nest servers, projects, resources and traffic, with GitHub deployment automation and rollback. It combines the Vercel capability review with the general Nest Deploy requirements.

## The Version 1 user flow

1. **Sign in with Hack Club Auth (HCA).** This is the likely Hack Club-native login option. HCA documents OAuth authorization-code login and identity scopes. Registering an OAuth app and receiving the credentials/permissions needed for this product must be confirmed; HCA login proves a user's identity, but does not itself grant access to their Nest container. [HCA OAuth guide](https://auth.hackclub.com/docs/oauth-guide) · [HCA API scopes](https://github.com/hackclub/auth/blob/main/app/views/docs/api.md.erb).
2. **Connect a Nest server.** The site generates a dedicated ed25519 key for the user's Nest account and shows its public key. The user pastes that key into the Nest dashboard's SSH Keys page and clicks Test connection. The site then connects with `ssh <nest-username>@hackclub.app`. The Nest bastion checks the key and routes the session to the user's container as `root`, so this key grants root on that container. The site stores the private key encrypted, never displays it, and the user can revoke it at any time by removing the key in the Nest dashboard. Do not collect a Nest password or the user's personal private key.
3. **Connect GitHub.** Let the user install a GitHub App for selected repositories and branches. Keep GitHub authorization separate from HCA and Nest credentials.
4. **Launch a project.** Detect supported project settings, let the user review the runtime/build configuration and environment variables, then deploy to their connected server. Show progress and errors.
5. **Manage it.** The user sees its URL, deployed commit, logs, health, resources, visits/traffic when available, previews, domains and rollback controls in the dashboard.

The goal is that a person who has just finished a supported project can sign in, connect their server and repository, and deploy without manually setting up every service. “Any website” should mean the runtimes and network configurations Nest Deploy explicitly supports; it cannot guarantee arbitrary applications work on Nest.

## Version 1: private Nest deployment dashboard

The first release is the full self-hosted Nest Deploy experience we are aiming to offer: connect a Nest server, deploy and manage projects, and understand their resources and traffic. Implement the supporting integrations and infrastructure as part of this version, validating each against Nest policies and limits.

- **Private account and Nest connection:** secure sign-in; pair one or more Nest servers through a guided setup; show its identity, connection status and last check-in; support reconnect and revoke. Give each server its own workspace, projects, metrics and connection controls.
- **GitHub project import:** connect GitHub with least-privilege access; select a repository, branch and commit; configure the project root, runtime, build/start commands, port and environment variables; support a useful set of common runtimes rather than limiting the product to Node.js.
- **Deploy and manage:** manually deploy, then automatically deploy authorized GitHub pushes; show build/runtime logs, status, commit, health and deployment history; allow restart and cancel.
- **Server overview:** show CPU, memory and disk usage, agent status, managed projects and historical trends. Add per-project resource metrics where attribution is reliable; make stale or unavailable data explicit. Include uptime checks, searchable logs and configurable alerts.
- **Rollback:** retain prior known-good releases and restore one safely. Explain that database migrations and external state are not automatically reversed.
- **Public app access:** provide a working default URL and HTTPS, plus custom domain setup and automation through Nest-approved routing, DNS and certificate mechanisms. Detect conflicts and show clear setup and renewal status.
- **Safe operations:** least privilege, secure pairing, scoped/revocable credentials, secret redaction, bounded logs/builds/releases, backup and recovery for the shared control plane, and tested agent updates/uninstall. Treat app builds as untrusted code and state isolation limits honestly.
- **First release support:** document installation, supported runtimes and examples, troubleshooting and recovery. Validate the complete experience with a small private pilot before wider rollout.

- **Traffic analytics:** visits, requests, errors and latency from a proxy or analytics source, with clear metric definitions, privacy choices and retention.
- **Preview deployments:** branch and pull-request previews with temporary URLs, access controls, quotas and automatic cleanup.
- **Team access:** invitations and scoped server/project roles so collaborators do not share account credentials.
- **Advanced monitoring:** per-project metrics where attribution is reliable, historical trends, uptime checks, searchable logs, configurable alerts, and integrations for tracing or web performance data where supported.

These are Version 1 product capabilities. Implement them in the same product release, validating each against Nest routing, data sources, security, permissions and resource limits.

## Version 2: expanded platform and integrations

Extend the complete dashboard with more providers, deeper automation and operational scale after Version 1 works reliably and pilot feedback confirms demand.

- Additional Git providers and specialized repository workflows.
- Broader runtimes and project support, including monorepos, workers and scheduled tasks.
- Deployment checks, approval gates, progressive rollout and zero-downtime switching where Nest routing and capacity support them.
- Public CLI/API, deploy hooks and optional MCP integrations after authorization, audit and revocation are mature.
- Optional integrations with user-managed databases, storage, CDN and external observability services.
- Deeper tracing, web performance data, custom metrics and log export.
- Expanded team administration; enterprise SSO remains out of scope.

## Out of scope for both versions

- AI Gateway, model hosting/routing, v0 generation, AI SDK and Chat SDK as Nest Deploy products.
- Recreating a global CDN/edge network, worldwide routing, global autoscaling, or Vercel's managed serverless/Fluid Compute platform.
- Building a managed database, object store, container registry, durable workflow engine or message queue.
- Vercel's marketplace/platform business, microfrontends platform, BotID, enterprise bot management, compliance program or enterprise networking.
- Billing users for hosted resources. First establish the control-plane operator, costs and Nest policies.

## Vercel features informing both versions

The following tables retain Need and Could need feature rows from the detailed Vercel catalogs as reference. The version lists above decide when each capability belongs; a Vercel feature does not imply Nest supports it.

### Platform features

## Accounts, projects and source control
| Vercel feature and documented controls | Nest Deploy fit | Reason and source pages |
| --- | --- | --- |
| Accounts, account settings, access tokens, token creation, expiration, scope (account/team/project), token revocation, login/logout | Need | Need user identity and revocable scoped credentials. Nest Deploy tokens should be short-lived and bound to a server/project. [Accounts](https://vercel.com/docs/accounts), [access tokens](https://vercel.com/docs/accounts/access-tokens), [CLI login](https://vercel.com/docs/cli/login), [CLI tokens](https://vercel.com/docs/cli/tokens) |
| Teams, organizations, members, invitations, access groups, team roles, project-level roles, extended permissions, member management | Could need | Start with a single owner per server; later support collaborators with narrow project permissions. [RBAC](https://vercel.com/docs/rbac), [access groups](https://vercel.com/docs/rbac/access-groups), [roles](https://vercel.com/docs/rbac/access-roles) |
| Project creation, project settings, linking a local project, framework selection, project environment, project configuration file, build/development settings | Need | Users need a project record tied to a server, repository and explicit runtime settings. [Projects](https://vercel.com/docs/projects), [project configuration](https://vercel.com/docs/project-configuration), [CLI project linking](https://vercel.com/docs/cli/project-linking) |
| Git provider connection; repository import; GitHub/GitLab/Bitbucket/Azure DevOps; selected branches; commit metadata; protected Git scopes; monorepo roots and project selection | Need / Could need | GitHub is needed for the first smooth flow; other providers and advanced monorepos can follow. [Git](https://vercel.com/docs/git), [protected Git scopes](https://vercel.com/docs/protected-git-scopes), [monorepos](https://vercel.com/docs/monorepos) |
| Project templates, starter examples, package-manager detection, framework presets and build configuration | Need | Detect common defaults, explain them and allow expert overrides. [Frameworks](https://vercel.com/docs/frameworks), [package managers](https://vercel.com/docs/package-managers), [templates](https://vercel.com/docs/templates) |

## Builds and deployment lifecycle
| Vercel feature and documented controls | Nest Deploy fit | Reason and source pages |
| --- | --- | --- |
| Build command, output directory, install command, environment, build image, build features and build queue | Need | Essential to build applications; initially support one validated runtime and bounded build resources. [Builds](https://vercel.com/docs/builds), [configure a build](https://vercel.com/docs/builds/configure-a-build), [build image](https://vercel.com/docs/builds/build-image), [build queues](https://vercel.com/docs/builds/build-queues) |
| Build logs, build status, cancellation, retries, cache, build usage, build troubleshooting | Need | Users need observable failures; control time, memory, concurrency, retries and cache size. [Managing builds](https://vercel.com/docs/builds/managing-builds), [build features](https://vercel.com/docs/builds/build-features), [CLI build](https://vercel.com/docs/cli/build) |
| Git push deployments, branch rules, commit checks, deployment checks, deploy hooks, CLI/API deployments and direct Drop deploys | Need / Could need | Automatic GitHub deployment is required by the vision; CLI/hooks and direct uploads are optional entry points. [Git deployments](https://vercel.com/docs/git), [checks](https://vercel.com/docs/checks), [deploy hooks](https://vercel.com/docs/deploy-hooks), [Drop](https://vercel.com/docs/drop) |
| Deployment list and detail, state transitions, source commit, build/runtime output, generated URLs, inspect, logs and redeploy | Need | Core project history and troubleshooting surface. [Deployments](https://vercel.com/docs/deployments), [CLI inspect](https://vercel.com/docs/cli/inspect), [CLI logs](https://vercel.com/docs/cli/logs) |
| Preview deployments, unique deployment URLs, preview sharing, preview protection, PR deployment, preview-to-production promotion | Could need | Valuable, but requires isolation, temporary routes, resource quotas, cleanup and possibly access control. [Generated URLs](https://vercel.com/docs/deployments/generated-urls), [preview sharing](https://vercel.com/docs/deployments/sharing-a-preview-deployment), [promote preview](https://vercel.com/docs/deployments/promote-preview-to-production) |
| Production promotion, aliasing, deployment rollback, instant rollback, redeploy old source, rolling releases, gradual traffic shifting and deployment policies | Need / Could need | Retained-release rollback is core. Gradual rollouts and automated policy need routing and more infrastructure. Rollback does not revert database or external state. [Promoting](https://vercel.com/docs/deployments/promoting-deployments), [rollback](https://vercel.com/docs/instant-rollback), [rolling releases](https://vercel.com/docs/rolling-releases), [deployment policies](https://vercel.com/docs/deployments/deployment-policies) |
| Deployment retention, deployment storage, artifact optimization, retention rules and cleanup | Need | Define how long rollback artifacts and logs remain; storage is finite in a user container. [Deployment retention](https://vercel.com/docs/deployment-retention), [deployment storage](https://vercel.com/docs/deployment-storage) |
| Skew protection between application versions, immutable assets and deployment consistency | Could need | Useful for multi-version traffic and client assets; requires version-aware routing. [Skew protection](https://vercel.com/docs/skew-protection), [Build Output API](https://vercel.com/docs/build-output-api) |

## Runtime, compute and routing
| Vercel feature and documented controls | Nest Deploy fit | Reason and source pages |
| --- | --- | --- |
| Static output hosting and file serving | Need | Common beginner workload with a simple build-and-publish path. [Build Output API](https://vercel.com/docs/build-output-api), [directory listing](https://vercel.com/docs/directory-listing) |
| Long-running Node.js/Python services, daemons, process lifecycle, restart and service bindings | Need | Fits Nest's Linux server model if user-container permissions support it. [Daemons](https://vercel.com/docs/daemons), [services](https://vercel.com/docs/services), [Build Output API services](https://vercel.com/docs/build-output-api/services) |
| Serverless functions, runtimes, regions, Fluid Compute, duration/concurrency settings and function logs | Could need | These depend on a managed execution layer; do not imply the same behavior from a persistent process. [Functions](https://vercel.com/docs/functions), [Fluid Compute](https://vercel.com/docs/fluid-compute), [regions](https://vercel.com/docs/regions) |
| Cron schedules and scheduled invocations | Could need | Useful for jobs; use a Nest-compatible scheduler or external service and explain reliability limits. [Cron Jobs](https://vercel.com/docs/cron-jobs), [CLI crons](https://vercel.com/docs/cli/crons) |
| Queues, consumers, producers, delivery/retry behavior, polling modes, SDKs, observability and pricing | Could need | Better as an integration than a new queue service unless users show demand. [Queues](https://vercel.com/docs/queues), [queue concepts](https://vercel.com/docs/queues/concepts), [queue observability](https://vercel.com/docs/queues/observability) |
| Durable workflows, steps, run state, retries, retention, payloads, events, pricing and observability | Could need | Separate orchestration product; not required for basic hosting. [Workflows](https://vercel.com/docs/workflows), [workflow concepts](https://vercel.com/docs/workflows/concepts), [retention](https://vercel.com/docs/workflows/retention) |
| Sandboxes, persistent sandboxes, snapshots, disks, images, regions, network/firewall policy, runtime selection and secure compute | Need (security principle); Could need (Vercel product) | Builds execute untrusted code, so isolation is required; reproduce only mechanisms that Nest permits and can secure. Vercel Sandboxes themselves are not a Nest requirement. [Sandbox](https://vercel.com/docs/sandbox), [secure compute](https://vercel.com/docs/sandbox/concepts/secure-compute), [firewall](https://vercel.com/docs/sandbox/concepts/firewall), [persistent sandboxes](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes) |
| Container registry and images | Could need | Optional build/deployment format; only if it fits Nest quotas and user workflows. [Container Registry](https://vercel.com/docs/container-registry) |
| Routes, rewrites, redirects, bulk redirects, custom error pages and project routing rules | Could need | Provide only through a supported Nest reverse proxy or domain mechanism. [Routing](https://vercel.com/docs/routing), [redirects](https://vercel.com/docs/routing/redirects), [bulk redirects](https://vercel.com/docs/routing/redirects/bulk-redirects), [custom errors](https://vercel.com/docs/custom-error-pages) |

## Domains, delivery, caching and data
| Vercel feature and documented controls | Nest Deploy fit | Reason and source pages |
| --- | --- | --- |
| Project domains, custom domains, DNS verification, redirects, certificates, domain transfers and domain troubleshooting | Need / Could need | A reachable app URL is needed; custom-domain automation depends on Nest DNS/reverse-proxy support and domain-owner authorization. [Domains](https://vercel.com/docs/domains), [CLI domains](https://vercel.com/docs/cli/domains) |
| CDN delivery, cache status, cache-control headers, purge/invalidation, cache debugging and usage | Could need | A single user container cannot provide global edge delivery; can integrate an approved CDN and explain cache behavior. [CDN](https://vercel.com/docs/cdn), [caching](https://vercel.com/docs/caching), [cache purge](https://vercel.com/docs/caching/cdn-cache/purge), [CDN usage](https://vercel.com/docs/manage-cdn-usage) |
| Image optimization, responsive image transformation, formats, loader and caching | Could need | Useful for web performance but requires supported runtime/edge capacity or external integration. [Image Optimization](https://vercel.com/docs/image-optimization) |
| Incremental Static Regeneration, revalidation, on-demand revalidation, draft mode and partial prerendering | Could need | Framework/runtime features, not standalone control-panel features; support through compatible app builds. [ISR](https://vercel.com/docs/incremental-static-regeneration), [draft mode](https://vercel.com/docs/draft-mode), [partial prerendering](https://vercel.com/docs/partial-prerendering) |
| Blob/object storage: public/private storage, upload/download, client/server uploads, signed URLs, access control, examples, SDK and usage/pricing | Could need | Apps may need object storage; integrate an actual provider instead of implying Nest Deploy includes one. [Vercel Blob](https://vercel.com/docs/vercel-blob), [private storage](https://vercel.com/docs/vercel-blob/private-storage), [signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls) |
| Postgres, Redis, marketplace storage and external integrations | Could need | Offer links or connection guidance; hosting databases brings backups, quotas, persistence and recovery obligations. [Storage](https://vercel.com/docs/storage), [Postgres](https://vercel.com/docs/postgres), [Redis](https://vercel.com/docs/redis), [marketplace storage](https://vercel.com/docs/marketplace-storage), [Integrations](https://vercel.com/docs/integrations) |

## Logs, metrics, analytics and feedback
| Vercel feature and documented controls | Nest Deploy fit | Reason and source pages |
| --- | --- | --- |
| Runtime/build logs, filtering, search, structured output, traces, instrumentation and error investigation | Need / Could need | Build/runtime logs are core; traces are advanced. Redact secrets, bound retention and label log source. [Logs](https://vercel.com/docs/logs), [tracing](https://vercel.com/docs/tracing), [instrumentation](https://vercel.com/docs/tracing/instrumentation) |
| Server CPU, memory, disk, process health, uptime, project attribution, quota and time-series views | Need | This is an explicit Nest Deploy goal. Report scope and measurement source, and show unavailable/stale data rather than inventing precision. Vercel observability is a reference, not the source of Nest host metrics. [Observability](https://vercel.com/docs/observability), [metrics](https://vercel.com/docs/query) |
| Alerts, thresholds, notifications and alert configuration | Need | Notify about failed builds, offline agent/apps and resource pressure. [Alerts](https://vercel.com/docs/alerts), [configure alerts](https://vercel.com/docs/alerts/configure-alerts), [notifications](https://vercel.com/docs/notifications) |
| Web Analytics: visits, referrers, pages, devices, custom events, filters, APIs, CLI access, privacy, sensitive-data redaction, limits and troubleshooting | Need (visits requested); exact mechanism Could need | Visits require instrumentation or a proxy/provider; disclose analytics behavior, retention and privacy. [Analytics](https://vercel.com/docs/analytics), [custom events](https://vercel.com/docs/analytics/custom-events), [filtering](https://vercel.com/docs/analytics/filtering), [redaction](https://vercel.com/docs/analytics/redacting-sensitive-data), [privacy](https://vercel.com/docs/analytics/privacy-policy) |
| Speed Insights/web vitals, custom performance metrics, usage limits and CLI/API access | Could need | Useful for frontend projects once standard server metrics are reliable. [Speed Insights](https://vercel.com/docs/speed-insights), [metrics](https://vercel.com/docs/speed-insights/metrics) |
| Drains/export of logs, analytics or audit events to providers; notebooks and query tooling | Could need | Advanced users may want external observability; use existing providers rather than build a data platform. [Drains](https://vercel.com/docs/drains), [notebooks](https://vercel.com/docs/notebooks), [query](https://vercel.com/docs/query) |
| Toolbar, comments, layout-shift/interaction/accessibility tools and preview feedback | Could need | Helpful developer feedback on previews, after deployment and monitoring are stable. [Toolbar](https://vercel.com/docs/vercel-toolbar), [comments](https://vercel.com/docs/comments) |

## Security, operations and platform governance
| Vercel feature and documented controls | Nest Deploy fit | Reason and source pages |
| --- | --- | --- |
| Firewall custom rules, managed rulesets, IP blocking/trusted IP, rate limits, attack mode, DDoS mitigation, firewall analytics and pricing | Could need | Protect the public control plane and offer only defenses backed by verified network infrastructure. A Nest user container does not inherit Vercel's edge firewall. [Firewall](https://vercel.com/docs/vercel-firewall), [WAF](https://vercel.com/docs/vercel-firewall/vercel-waf), [rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [DDoS mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation) |
| Deployment protection for previews, access restrictions and shared preview safety | Could need | Useful once previews exist; not a substitute for securing the agent/control plane. [Deployment Protection](https://vercel.com/docs/deployment-protection) |
| Encryption, security headers, reverse-proxy guidance and CDN security | Need (baseline); product-specific controls Could need | Apply sound control-plane, agent and app configuration security; do not claim Vercel's edge protections. [CDN security](https://vercel.com/docs/cdn-security), [security headers](https://vercel.com/docs/cdn-security/security-headers), [reverse proxy](https://vercel.com/docs/security/reverse-proxy) |
| Secret/environment-variable scopes, preview/production values, encrypted storage, edits, pull/push and local development | Need | Secrets are central to deploy workflows. Encrypt, scope, redact, rotate and never include values in build logs. [Environment variables](https://vercel.com/docs/environment-variables), [CLI env](https://vercel.com/docs/cli/env) |
| Key management, access tokens, MFA/two-factor enforcement, audit logs and activity logs | Need | Minimize control-plane credentials, let users revoke connections and record sensitive actions. [KMS](https://vercel.com/docs/kms), [two-factor authentication](https://vercel.com/docs/two-factor-authentication), [audit log](https://vercel.com/docs/audit-log), [activity log](https://vercel.com/docs/activity-log) |
| Usage limits, quotas, plans, spend alerts, budgets, usage reports and billing | Need (limits); Could need (billing) | Guard per-server CPU, memory, disk and build concurrency. Customer billing is undecided; operator cost and resource warnings matter. [Limits](https://vercel.com/docs/limits), [plans](https://vercel.com/docs/plans), [spend management](https://vercel.com/docs/spend-management), [pricing](https://vercel.com/docs/pricing) |
| Conformance rules, custom rules, dependency/import restrictions and framework best-practice checks | Could need | Optional pre-deploy checks after the core build path; do not block arbitrary apps on subjective rules. [Conformance](https://vercel.com/docs/conformance), [custom rules](https://vercel.com/docs/conformance/custom-rules) |
| Code owners, approvers, deployment comments, collaboration and review workflow | Could need | Team workflow can wait until multiple users share a server/project. [Code Owners](https://vercel.com/docs/code-owners), [comments](https://vercel.com/docs/comments) |
| Release phases, betas, changelog, API errors, troubleshooting, support and product docs | Need | Maintain versioned agent releases, migration notes, useful error messages, recovery instructions and support boundaries. [Release phases](https://vercel.com/docs/release-phases), [errors](https://vercel.com/docs/errors), [support](https://vercel.com/docs/support-center) |

## Distinct Vercel products outside the Nest Deploy goal
| Vercel capability | Nest Deploy fit | Reason |
| --- | --- | --- |
| Agent resources, MCP tools, Vercel Connect/token brokering and eve agent platform | Could need (optional integrations) | Not needed to deploy/manage Nest projects; assess only after secure APIs exist. See [[Audit AI Agent Docs]] and [[audit-connect-eve]]. |


### AI, agent, Connect and MCP features

| Documentation set | Features found | Nest Deploy fit |
| --- | --- | --- |
| MCP | Server deployment, client integrations, tool discovery and events | Could need later for authorized Nest Deploy actions |
| Vercel Connect | OAuth connectors, installations, token scopes, consent, triggers and provider integrations | Secure authorization patterns needed; Connect product itself optional |

## AI Gateway
Source: [AI Gateway documentation](https://vercel.com/docs/ai-gateway), [models and integrations](https://vercel.com/docs/ai-gateway/models-and-providers), [SDKs and APIs](https://vercel.com/docs/ai-gateway/sdks-and-apis), [observability](https://vercel.com/docs/ai-gateway/observability).
| Feature | Nest Deploy decision | Reason |
| --- | --- | --- |
| Budgets, rate limits, usage attribution and cost visibility | Could need as a pattern | Per-server build and resource quotas are relevant; model billing is not. |

## Agent resources, provider integrations and skills
Sources: [Agent resources](https://vercel.com/docs/agent-resources), [agent integrations](https://vercel.com/docs/agent-resources/integrations-for-agents), [model integrations](https://vercel.com/docs/agent-resources/integrations-for-models), [skills](https://vercel.com/docs/agent-resources/skills), [Markdown access](https://vercel.com/docs/agent-resources/markdown-access).
| Feature | Nest Deploy decision | Reason |
| --- | --- | --- |
| Agent skills and reusable instructions | Could need | A future operator helper could guide troubleshooting, but is not needed for the dashboard. |
| Markdown documentation access and agent discovery | Could need | Publishing readable Nest Deploy docs could help users and tools; optional. |
| A Nest Deploy MCP with a restricted allowlist | Could need later | Could expose list projects, deployment status, logs, deploy and rollback after API authorization is secure. Never expose unrestricted shell by default. |

## Vercel MCP tool surface
Source: [Vercel MCP tools](https://vercel.com/docs/agent-resources/vercel-mcp/tools). The docs enumerate operations under these families. This is their functional scope, not an endorsement to reproduce each operation.
| Tool family documented | Examples of operations | Nest Deploy decision |
| --- | --- | --- |
| Projects and teams | List/read projects, teams, users and memberships | Could need later; scope every result to the user’s workspaces. |
| Deployments | Create/cancel/list/read deployments, build logs, files, Git context, URLs and events | Need the underlying deployment actions; MCP exposure could come later. |
| Logs and agent runs | Query logs; list runs and inspect run traces | Need application logs; AI run traces do not apply. |
| Domains, DNS and certificates | Check/buy domains, inspect or create records, inspect/issue certificates | Could need where Nest supports it; purchases and DNS changes require explicit consent. |
| Environment and project configuration | Read or update project settings and variables | Need configuration management with strong secret redaction; arbitrary config tools must be scoped. |
| Routing and protection | Routes, redirects, bypasses and URL protection | Could need when Nest routing supports it; avoid unsafe bypass operations. |
| Firewall and security | Inspect/update firewall configuration and protection | Could need via approved Nest integrations; not assume Vercel network controls exist. |
| Caching and artifacts | Query/invalidate caches, remote cache status, upload artifacts | Could need build cache later; resource usage and cleanup matter. |
| Checks and CI | Rerequest checks; inspect Vercel CI definitions, jobs, runs and logs; retry runs | Could need deployment checks and retry; Vercel CI controls themselves are not required. |
| Analytics | Aggregate/count pageviews and events; read Web Analytics | Could need traffic metrics via an appropriate Nest-compatible source. |
| Sandboxes | Create, list, update and stop sessions; run commands; read/write files; snapshots and network policies | Could need as an isolation design reference. Do not expose general command execution in a Nest Deploy agent without a verified sandbox boundary. |

## Agent harnesses and Vercel Agent
Sources: [Agent harnesses](https://vercel.com/docs/agent-harnesses), [security](https://vercel.com/docs/agent-harnesses/security), [observability](https://vercel.com/docs/agent-harnesses/observability), [self-hosting](https://vercel.com/docs/agent-harnesses/self-hosting), [Vercel Agent](https://vercel.com/docs/agent).
| Feature | Nest Deploy decision | Reason |
| --- | --- | --- |
| Resume after crashes using persistent workflow/run state | Could need as reliability pattern | Deployment jobs should survive control-plane restarts and report their state. |

## AI SDK and Chat SDK
Sources: [AI SDK](https://vercel.com/docs/ai-sdk), [AI SDK with AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/ai-sdk), [Chat SDK](https://vercel.com/docs/chat-sdk), [MCP integration with AI SDK](https://vercel.com/docs/mcp/integrations/ai-sdk).
| Feature | Nest Deploy decision | Reason |
| --- | --- | --- |
| MCP client/server connections through AI SDK | Could need later | Potential integration for user-authorized automation; prioritize the deployment API and controls first. |

## MCP product and integrations
Sources: [MCP](https://vercel.com/docs/mcp), [deploy MCP servers](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel), [MCP integrations](https://vercel.com/docs/mcp/integrations), [MCP events](https://vercel.com/docs/connect/mcp-events), [CLI MCP](https://vercel.com/docs/cli/mcp).
| Feature | Nest Deploy decision | Reason |
| --- | --- | --- |
| Host an MCP server as a deployed service | Could need | Nest Deploy itself may be used to host MCP applications, but no special MCP hosting is required. |
| Discover available tools and configure clients | Could need later | Useful if Nest Deploy offers a constrained MCP endpoint. |
| OAuth/authentication for MCP clients | Need if MCP is built | Must preserve per-user and per-server authorization; never rely on obscure tool names as security. |
| MCP event subscriptions and notifications | Could need | Deployment status events may power integrations; dashboard is first. |

## Vercel Connect
Sources: [Connect](https://vercel.com/docs/connect), [authentication](https://vercel.com/docs/connect/concepts/authentication), [connectors](https://vercel.com/docs/connect/concepts/connectors), [installations](https://vercel.com/docs/connect/concepts/installations), [tokens](https://vercel.com/docs/connect/concepts/tokens), [triggers](https://vercel.com/docs/connect/concepts/triggers), [pricing and limits](https://vercel.com/docs/connect/pricing).
| Feature | Nest Deploy decision | Reason |
| --- | --- | --- |
| OAuth connectors and provider account linking | Could need | GitHub authorization is core; a general-purpose connector marketplace is optional. |
| Connector installation, consent and revocation lifecycle | Need as a pattern | Users must understand and revoke GitHub/server grants. |
| Short-lived scoped provider tokens | Need as a pattern | Prefer narrow expiring credentials over broad long-lived tokens. |
| Project/environment-scoped provider links | Could need | Bind repository and credentials to explicit server/project scope. |
| Trigger subscriptions and webhook forwarding | Need | Automatic Git deployments need authenticated, replay-resistant, idempotent event handling. |
| Connect usage metering, pricing and legal terms | Could need as a pattern | Study limits and operator costs; do not reproduce Connect as a product. |
| Connect observability and MCP events | Could need | Useful status events later; API/dashboard reliability comes first. |

## eve
Sources: [eve](https://vercel.com/docs/eve), [concepts](https://vercel.com/docs/eve/concepts), [authentication](https://vercel.com/docs/eve/authentication), [agent runs](https://vercel.com/docs/eve/agent-runs), [software factory](https://vercel.com/docs/eve/software-factory).
| Feature | Nest Deploy decision | Reason |
| --- | --- | --- |
| Agent run durability, deployment and sandbox execution | Could need as a pattern | Job state and build isolation merit study, but eve is not a Nest deployment mechanism. |
| User/session authentication and authorization | Need as a pattern | Every server/project action must check ownership and scope. |
| Usage limits, estimates and cost controls | Could need as a pattern | Transparent build and resource quotas matter; eve pricing does not. |


### REST API feature families

See [[REST API Feature Catalog]] for all 938 individual API operations and source links. The API is a reference for what Vercel exposes; Nest Deploy only needs operations supporting the core workflows above. The REST API audit considers SDK-reference operations **Could need** as implementation tooling, while unrelated Vercel administration endpoints stay out of the Nest product.

## General requirements and implementation stages

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



## Decisions to verify before Version 1

- Confirm user-container permissions, agent persistence/outbound connectivity, process management, routing, domains, quotas, resource metrics and build isolation with Nest maintainers.
- Decide who hosts and operates the shared control plane, handles incidents and pays its costs.
- Test one private Nest server and one supported project end to end before promising automated setup or broader runtime support.
- Revisit “Later” items with pilot users; do not promote them just because Vercel offers them.

## Research references

[[Vercel Docs Coverage and Audit Index]] provides sitemap coverage and captured source text. Detailed feature catalogs: [[Platform Feature Catalog]], [[AI Agent Feature Catalog]], and [[REST API Feature Catalog]].
