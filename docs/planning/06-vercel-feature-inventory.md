# Vercel Feature Inventory

Research snapshot: 28 October 2026. Related: [[Nest - Deploy]] · [[Nest Deploy Requirements]].

This is a broad **product-area inventory**, grounded in Vercel's public documentation navigation and selected feature pages. It is not a verified list of every setting, plan entitlement, subfeature, private feature or recent change. Beta/new labels reflect the documentation at the time of research. Items below are Vercel product families or documented capabilities, not a promise that Nest Deploy will replicate them. Check individual linked documentation, pricing and availability before making commitments.

## Projects, source and builds

- Projects and project configuration; framework support; templates; monorepos; Git integrations; builds; CLI; REST API and SDK; build output API; webhooks; checks; errors.
- Git-based deployments, with documented integrations for GitHub, GitLab, Bitbucket and Azure DevOps. Vercel also documents CLI, deploy hooks, REST API and Drop deployment methods.
- Build configuration and logs, deployment summaries, generated deployment URLs and deployment management.

Sources: [Documentation index](https://vercel.com/docs), [Deployments](https://vercel.com/docs/deployments), [Projects](https://vercel.com/docs/projects), [Git](https://vercel.com/docs/git), [Builds](https://vercel.com/docs/builds).

## Deployment lifecycle

- Preview and production environments; preview URLs and sharing; promotion to production; deployment policies; deployment checks; retention and storage; troubleshooting.
- Rollback, rolling releases and skew protection; deploy hooks and claim deployments.
- Automatic deployments from connected Git activity; detailed behavior and access vary by provider, configuration and plan.

Sources: [Deployments](https://vercel.com/docs/deployments), [Instant Rollback](https://vercel.com/docs/instant-rollback), [Rolling Releases](https://vercel.com/docs/rolling-releases).

## Runtime, routing and delivery

- Functions, Fluid Compute, routing middleware, cron jobs, queues (beta), daemons (beta), workflows, sandbox and container registry.
- Routing, domains, CDN / delivery network, microfrontends, services (beta) and Vercel for Platforms.
- Storage and integrations: examine each specific offering and provider rather than assuming every database is Vercel-operated.

Sources: [Functions](https://vercel.com/docs/functions), [CDN](https://vercel.com/docs/cdn), [Domains](https://vercel.com/docs/domains), [Storage](https://vercel.com/docs/storage), [Integrations](https://vercel.com/docs/integrations).

## Observability and collaboration

- Runtime logs, alerts, insights, custom metrics, monitoring, query, tracing and instrumentation, notebooks and drains.
- Web Analytics, custom events, filtering and privacy controls; Speed Insights and web performance metrics.
- Toolbar, feature flags, notifications, project collaboration and support. Specific observability capabilities and retention vary by plan.

Sources: [Observability](https://vercel.com/docs/observability), [Web Analytics](https://vercel.com/docs/analytics), [Speed Insights](https://vercel.com/docs/speed-insights), [Toolbar](https://vercel.com/docs/vercel-toolbar), [Feature Flags](https://vercel.com/docs/flags).

## Security, identity and administration

- Firewall, bot management, BotID and deployment protection; identity and access controls, networking, key management (beta), Passport and security/compliance resources.
- Account and team management; plans, limits, spend management, pricing and notifications.

Sources: [Security](https://vercel.com/docs/security), [Account management](https://vercel.com/docs/accounts), [Firewall](https://vercel.com/docs/vercel-firewall), [Deployment Protection](https://vercel.com/docs/deployment-protection).

## AI and developer ecosystem

- AI Gateway, AI SDK, Chat SDK, v0, Sandbox, Vercel Agent, Vercel MCP, AI integrations, Vercel Connect, agent resources and harnesses; the documentation also lists Token Pass and eve.
- Marketplace/integration APIs, REST API, SDK, CLI, project configuration, templates, checks and webhooks.

Sources: [Documentation index](https://vercel.com/docs), [AI Gateway](https://vercel.com/docs/ai-gateway), [AI SDK](https://ai-sdk.dev/docs), [REST API](https://vercel.com/docs/rest-api).

## What this means for Nest Deploy

The Vercel experience includes both a dashboard and a large hosting platform. [[Nest Deploy Requirements]] maps the useful workflows to proposed Nest-compatible solutions and identifies areas that depend on extra infrastructure. Nest Deploy must not imply equivalence to Vercel's global network, serverless compute, security products, managed storage or enterprise guarantees without actually providing and verifying them.
