> Scope decisions and final dispositions for every earlier “Could need” item are now in [[Nest Deploy Decided Feature Scope]].

See [[Vercel to Nest Deploy Feature Review]] for the consolidated decision matrix and detailed catalogs.

# Vercel Feature Comparison for Nest Deploy

Research snapshot: 28 October 2026. Related: [[Nest - Deploy]], [[Vercel Feature Inventory]], [[Nest Deploy Requirements]].

See [[Platform Feature Synthesis]] for the grouped recommendations based on 941 retrieved platform-documentation URLs, and [[audit-platform-batches]] for captured page text and exact URL-level evidence. Retrieval coverage does not establish semantic completeness: each captured body is limited to 4,500 characters.

This is a comparison of documented product areas and selected features, **not an exhaustive audit of every Vercel documentation page or setting**. The recommendations are our judgments for Nest Deploy; they do not claim the feature exists in Nest Deploy. Vercel availability and plans vary.

**Need** means important to the intended product, not necessarily the first release. **Could need** means useful depending on demand and feasibility. **Do not need** means outside the current goal; revisit if that goal changes.

## Accounts and projects

Sources: [Accounts](https://vercel.com/docs/accounts), [Projects](https://vercel.com/docs/projects), [Git](https://vercel.com/docs/git).

| Feature | Recommendation | Reason |
| --- | --- | --- |
| Accounts, sign-in and sessions | Need | Protect dashboard and server ownership. |
| Project creation and settings | Need | Organize each application. |
| GitHub repository connection | Need | Core import workflow. |
| GitLab, Bitbucket and Azure DevOps | Could need | Expand beyond GitHub later. |
| Team collaboration and invitations | Could need | Useful for shared projects later. |
| Roles and permissions | Need | Enforce ownership initially; expand for teams. |
| Enterprise SSO and governance | Do not need | Not required for individual-first use. |
| Notifications and account recovery | Need | Help users respond to failures and regain access. |
| Pricing, billing and spend management | Could need | Operator costs matter; customer billing is undecided. |
| Project templates | Could need | Make common projects easier to start. |
| Monorepo support | Could need | Support project subdirectories and selective builds. |
| Framework detection | Need | Smooth setup with explicit override. |
| Environment variables | Need | Configure applications and protect secrets. |

## Source, builds and deployment

Sources: [Deployments](https://vercel.com/docs/deployments), [Builds](https://vercel.com/docs/builds), [Git](https://vercel.com/docs/git).

| Feature | Recommendation | Reason |
| --- | --- | --- |
| Branch and commit selection | Need | Specify exactly what to deploy. |
| Automatic Git deployments | Need | Deploy on authorized GitHub pushes. |
| Build configuration and commands | Need | Support compatible app builds. |
| Build logs and errors | Need | Make failures understandable. |
| Build caching | Could need | Speed up builds within storage limits. |
| Deployment status and history | Need | Track outcomes, commits and times. |
| Production deployment | Need | Provide a clear live version. |
| Preview environments and URLs | Could need | Useful if routing and resources permit. |
| Pull request previews | Could need | Depends on preview capacity and cleanup. |
| Promote preview to production | Could need | Valuable after previews work. |
| Restore a previous deployment | Need | Keep and restore retained releases. |
| Redeploy an older commit | Need | Separate from restoring an existing artifact. |
| Rolling releases and traffic splitting | Could need | Requires compatible routing and capacity. |
| Skew protection | Could need | Relevant when multiple versions serve traffic. |
| Deployment retention and cleanup | Need | Bound storage while supporting rollback. |
| Deployment checks and approval policies | Could need | Useful for teams and production safeguards. |
| CLI deployment | Could need | Useful for automation and power users. |
| API deployment and deploy hooks | Could need | Useful integration surfaces when secured. |
| Direct file deployment | Could need | Potentially useful for static websites. |
| Claim deployment / deploy without login | Do not need | Not essential to user-owned workspaces. |

## Compute, routing and storage

Sources: [Functions](https://vercel.com/docs/functions), [Domains](https://vercel.com/docs/domains), [CDN](https://vercel.com/docs/cdn), [Storage](https://vercel.com/docs/storage).

| Feature | Recommendation | Reason |
| --- | --- | --- |
| Long-running web apps and services | Need | Core Nest use case. |
| Health checks and restarts | Need | Detect and recover from failures. |
| Static site support | Need | Common project type. |
| Node.js runtime | Need | Practical initial supported runtime. |
| Other runtimes | Could need | Add after compatibility testing. |
| Cron jobs and background workers | Could need | Useful automation for some users. |
| Queues and durable workflows | Could need | Consider an integration first. |
| Serverless functions / Fluid Compute | Could need | Requires different infrastructure; no parity assumed. |
| Sandbox and build isolation | Need | Assess and implement a truthful security boundary. |
| Container registry | Do not need | Not needed for the basic workflow. |
| Automatic global scaling | Do not need | Outside a single Nest container's capabilities. |
| Application URLs and routing | Need | Users must reach their apps. |
| HTTPS | Need | Use a Nest-supported certificate and routing approach. |
| Custom domains and DNS | Could need | Depends on Nest and domain-owner permissions. |
| Redirects and rewrites | Could need | Useful for supported routing configurations. |
| Global CDN | Could need | May require an external provider. |
| Microfrontends | Could need | Relevant only to some advanced projects. |
| Private enterprise networking | Do not need | Outside the current individual-first goal. |
| External databases and object storage | Could need | Integrations or user-managed services. |
| Managed database provisioning | Do not need | Not required to deploy applications. |
| Backups and restore | Need | Back up the control plane and clearly define project-data responsibility. |

## Observability and analytics

Source: [Vercel Observability](https://vercel.com/docs/observability).

| Feature | Recommendation | Reason |
| --- | --- | --- |
| Runtime logs | Need | Core troubleshooting. |
| Log search and filtering | Need | Make logs useful at scale. |
| Container CPU, memory and disk | Need | Core server dashboard; mark unavailable values. |
| Per-project resource usage | Need | Show only when attribution is reliable. |
| Health, availability and uptime | Need | Distinguish process and health status. |
| Alerts | Need | Notify about failures and resource pressure. |
| Web analytics and visits | Need | Requires a configured data source and privacy choices. |
| Request counts, errors and latency | Need | Requires a proxy or instrumentation. |
| Custom events and metrics | Could need | Useful for project-specific analysis. |
| Speed Insights and web vitals | Could need | Helpful for frontend performance. |
| Tracing and instrumentation | Could need | Helps debug complex services. |
| Monitoring queries and notebooks | Could need | Advanced analysis, not an initial requirement. |
| Log drains and provider integrations | Could need | Useful for advanced users. |
| Data retention and redaction | Need | Limit storage and exposure of sensitive data. |

## Security and administration

Sources: [Security](https://vercel.com/docs/security), [Firewall](https://vercel.com/docs/vercel-firewall), [Deployment Protection](https://vercel.com/docs/deployment-protection).

| Feature | Recommendation | Reason |
| --- | --- | --- |
| Identity, session and authorization controls | Need | Prevent cross-user access. |
| Secure agent pairing and credential rotation | Need | Protect control over user servers. |
| Secret management | Need | Protect application and integration credentials. |
| Audit events | Need | Record sensitive deployment and connection actions. |
| Preview deployment protection | Could need | Protect non-public preview URLs. |
| Firewall rules and DDoS protection | Could need | Rely on verified infrastructure or provider integrations. |
| Bot management and BotID | Do not need | Specialized products outside the core goal. |
| Enterprise compliance certifications | Do not need | Do not claim them without independent validation. |
| Feature flags | Could need | Consider integration when there is demand. |
| Toolbar and preview feedback | Could need | Possible future collaboration feature. |

## AI and platform products

Source: [Vercel documentation index](https://vercel.com/docs).

| Feature | Recommendation | Reason |
| --- | --- | --- |
| AI Gateway and model access | Do not need | Separate product from hosting management. |
| AI SDK and Chat SDK | Do not need | Applications can use these independently. |
| v0 app generation | Do not need | Separate product from deployment. |
| Agent and agent resources | Could need | Optional future assistance after core workflows work. |
| MCP integration | Could need | Optional automation after API and security mature. |
| Vercel Connect / token brokering | Could need | Potential integration; needs a security design. |
| Vercel for Platforms | Do not need | Separate platform product from user-owned server management. |
| AI integrations, Token Pass and eve | Do not need | Not necessary for the current Nest Deploy goal. |

## Additional Nest-specific requirements

| Feature | Recommendation | Reason |
| --- | --- | --- |
| Guided pairing with a Nest container | Need | Verify the agent/SSH approach with maintainers. |
| Separate workspace per server | Need | Keep server connections, projects and metrics distinct. |
| Agent heartbeat, updates and revocation | Need | Manage and recover connections safely. |
| Existing service discovery | Could need | Begin read-only and verify access. |
| Adopt existing projects | Could need | Explicit opt-in, preserving existing configuration. |
| Nest quotas, domains and infrastructure links | Need | Display supported information and workflows accurately. |
| Official Nest integration | Could need | Depends on maintainers and a successful pilot. |

## Remaining research

For a truly exhaustive audit, enumerate current documentation URLs, inspect every page and subpage, record each URL and review date, deduplicate features, verify plan and beta status, and record inaccessible or changed pages. This comparison is a starting point; that page-by-page audit is not yet complete. Validate Nest compatibility with the current guides and maintainers before promising features.

See [[Vercel Documentation Page Inventory]] for the sitemap-based page list and review status.

## Full audit references

- [[Vercel Docs Coverage and Audit Index]] — per-URL coverage check against the sitemap.
- [[Vercel REST API Feature Audit]] — REST API reference capabilities.
- [[Platform Feature Synthesis]] — product documentation capabilities.
- [[Audit AI Agent Docs]] and [[audit-ai-remaining]] — AI, agent and MCP capabilities.
- [[audit-connect-eve]] — Connect and eve documentation.


- [[REST API Feature Catalog]] — individual operation pages grouped by REST API family with Nest Deploy relevance.

See [[Nest Deploy Full Feature Requirements]] for the single combined Need/Could feature and general requirements document.

