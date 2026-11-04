> Scope decisions and final dispositions for every earlier “Could need” item are now in [[Nest Deploy Decided Feature Scope]].

# Vercel to Nest Deploy: Complete Feature Review

Snapshot: 28 October 2026. This is the working master document for our feature review. It consolidates the detailed catalogs below and classifies capabilities by their fit for the Nest Deploy goal. Ratings are product judgments, not current Nest functionality.

## Reading the decisions

- **Need:** necessary to deliver the intended self-serve deploy and server-management experience. Some Need items are later-stage requirements, not first-release scope.
- **Could need:** valuable if user demand, security, and Nest capabilities support it.
- **Do not need:** outside the current product goal; reconsider only if the goal changes.

## Feature-by-feature catalogs

| Vercel documentation area | Detailed catalog | Coverage represented |
| --- | --- | --- |
| Projects, Git, builds, deployments, runtime, routing, observability, security, accounts, storage and platform tools | [[Platform Feature Catalog]] | 941 sitemap URLs with recovered visible page text. |
| REST API | [[REST API Feature Catalog]] | 938 endpoint pages, grouped by 46 route families with one linked entry per page. |
| AI Gateway, AI SDK, agents, MCP, Connect, eve and Chat SDK | [[AI Agent Feature Catalog]] | 520 AI/agent pages, 32 Connect/eve pages, and section landing pages. |

## Priority for Nest Deploy

| Product area | Decision | What Nest Deploy needs to deliver |
| --- | --- | --- |
| Account and server workspaces | **Need** | Secure accounts; separately pair, identify, monitor, update and revoke each user's Nest server connection. |
| Git provider and project import | **Need** | Begin with GitHub App and selected repositories; verify webhooks; support branch and commit selection. |
| Build and deployment lifecycle | **Need** | Build supported projects, show logs and errors, retain deployment history, manually deploy, auto-deploy, redeploy and restore a prior release. |
| Project runtime controls | **Need** | Start, stop/restart and health-check managed projects; expose process state and the deployed commit. |
| Resource dashboard | **Need** | Show server CPU, memory and disk, and project metrics only when attribution is reliable; surface stale/unavailable measurements honestly. |
| Traffic and app analytics | **Need** for vision; stage after basics | Request counts, visits, errors and latency need a proxy or instrumentation source and clear privacy/retention controls. |
| Domains and HTTPS | **Need** for usable hosting; automation **Could need** | Use Nest-supported routes/certificates; custom-domain automation depends on maintainer and DNS capabilities. |
| Secrets and environment configuration | **Need** | Least privilege, redaction, secure storage, rotation and clear user control. |
| Rollback | **Need** | Restore a retained app release and configuration safely; warn that database migrations/external state are not reversed. |
| Preview deployments | **Could need** | Add only after routing, cleanup, resource limits and preview protection work. |
| Other Git providers and runtimes | **Could need** | Expand based on use; validate each integration and runtime separately. |
| Scheduled tasks, queues, serverless functions and global scaling | **Could need / usually Do not need initially** | Use existing Nest processes or external tools where possible; do not imply Vercel's managed global compute. |
| CDN, firewall, bot protection, DDoS mitigation | **Could need** | Integrate approved services if needed; a single user container cannot reproduce Vercel's global network. |
| Teams, roles, enterprise SSO and compliance | **Could need / Do not need initially** | Begin with individual ownership; expand only with real users and verified operational capacity. |
| AI Gateway, v0, AI SDK and Chat SDK | **Do not need** | These are separate products; they are not needed to deploy and manage Nest apps. |
| MCP/API automation for Nest Deploy | **Could need** | Expose only after normal account, authorization, audit and revocation flows are secure. |
| Storage and databases | **Could need** | Provide documentation or optional integrations; do not imply Nest Deploy manages databases by default. |

## Recommended build sequence

1. Verify with Nest maintainers: user-container permissions, agent persistence and outbound network, domain/routing integration, supported process management, resource metrics, quotas and permitted build isolation.
2. Pair one private Nest workspace and deploy one supported app from a specific GitHub commit. Test failed builds, logs, secrets, health checks, release retention and recovery.
3. Add the server/project dashboard and reliable resource display.
4. Add GitHub push deployments, history and tested rollback.
5. Pilot with users. Add visits/analytics, previews, domains and more runtimes only when their data sources, policies and resource costs are proven.

## Coverage and limits

See [[Vercel Docs Coverage and Audit Index]] for the 2,437-URL sitemap reconciliation and links to the captured source text. The feature catalogs link individual source pages or page families and distinguish feature decisions from availability on Nest. Product docs can contain plan limits, beta states and settings that change; verify those details before implementation. The catalogs represent capabilities identified in the captured docs, but the review groups repeated patterns and provider/model-specific pages where they express the same capability.

## Combined requirements

See [[Nest Deploy Full Feature Requirements]] for one consolidated document of all Need and Could need features plus the general product and implementation requirements.

