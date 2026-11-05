/**
 * The single source of truth for the docs outline. The left nav, the mobile
 * bar, the scroll spy and every `Section` / `H3` heading read their titles
 * from here, so a title can never be typed twice or drift.
 */

export type DocsSubsection = { id: string; title: string };
export type DocsSection = { id: string; title: string; subsections: DocsSubsection[] };
export type DocsGroup = { group: string; sections: DocsSection[] };

export const DOCS_NAV: DocsGroup[] = [
  {
    group: "Start",
    sections: [
      {
        id: "overview",
        title: "How it works",
        subsections: [{ id: "overview-push", title: "What happens on a push" }],
      },
      { id: "quickstart", title: "Quick start", subsections: [] },
    ],
  },
  {
    group: "Use it",
    sections: [
      {
        id: "servers",
        title: "Servers",
        subsections: [
          { id: "servers-connection", title: "How the connection works" },
          { id: "servers-manage", title: "Testing, rotating and removing" },
        ],
      },
      {
        id: "projects",
        title: "Projects and runtimes",
        subsections: [
          { id: "projects-settings", title: "Settings" },
          { id: "projects-runtimes", title: "Runtimes" },
          { id: "projects-guarantees", title: "What every app can rely on" },
        ],
      },
      {
        id: "deployments",
        title: "Deployments",
        subsections: [
          { id: "deployments-states", title: "States" },
          { id: "deployments-actions", title: "Actions" },
          { id: "deployments-releases", title: "Releases and previews on disk" },
          { id: "deployments-previews", title: "Branch previews" },
        ],
      },
      { id: "env", title: "Environment variables", subsections: [] },
      { id: "logs", title: "Logs", subsections: [] },
      { id: "domains", title: "Domains", subsections: [] },
    ],
  },
  {
    group: "Automate",
    sections: [
      {
        id: "github",
        title: "GitHub and previews",
        subsections: [
          { id: "github-push", title: "Deploying on push" },
          { id: "github-pr-previews", title: "Pull request previews" },
        ],
      },
      { id: "hooks", title: "Deploy hooks", subsections: [] },
      { id: "notifications", title: "Notifications", subsections: [] },
      {
        id: "api",
        title: "Access tokens and the API",
        subsections: [
          { id: "api-tokens", title: "Making a token" },
          { id: "api-scopes", title: "What a token can do" },
          { id: "api-limits", title: "Terminal, files and the 7-day rule" },
          { id: "api-mcp", title: "The API and agents" },
        ],
      },
    ],
  },
  {
    group: "Watch",
    sections: [
      {
        id: "monitoring",
        title: "Monitoring and uptime",
        subsections: [
          { id: "monitoring-service-card", title: "The Service card" },
          { id: "monitoring-resources", title: "Resource use" },
          { id: "monitoring-uptime", title: "Uptime checks and alerts" },
        ],
      },
      { id: "status-page", title: "Status page", subsections: [] },
      {
        id: "analytics",
        title: "Analytics",
        subsections: [
          { id: "analytics-setup-steps", title: "Setting it up" },
          { id: "analytics-data", title: "What you see" },
          { id: "analytics-privacy", title: "Privacy" },
        ],
      },
      { id: "activity", title: "Activity and account", subsections: [] },
    ],
  },
  {
    group: "Reference",
    sections: [
      { id: "security", title: "Security", subsections: [] },
      { id: "selfhost", title: "Running your own", subsections: [] },
      { id: "limits", title: "Limits", subsections: [] },
      {
        id: "troubleshooting",
        title: "Troubleshooting",
        subsections: [
          { id: "troubleshooting-connection", title: "Test connection fails" },
          { id: "troubleshooting-build", title: "The build fails" },
          { id: "troubleshooting-no-answer", title: "It built, but the app never answered" },
          { id: "troubleshooting-domain", title: "A domain stays on “Needs attention”" },
          { id: "troubleshooting-hook-409", title: "A deploy hook answers 409" },
          { id: "troubleshooting-pr-comment", title: "No comment appears on a pull request" },
          { id: "troubleshooting-alerts", title: "Alerts or notifications do not arrive" },
        ],
      },
    ],
  },
];

/** Every section, in reading order. Each one is its own page. */
export const DOCS_SECTIONS: DocsSection[] = DOCS_NAV.flatMap((g) => g.sections);

const SECTION_BY_ID = new Map(DOCS_SECTIONS.map((s) => [s.id, s]));

const SUB_BY_ID = new Map(
  DOCS_SECTIONS.flatMap((s) => s.subsections.map((sub) => [sub.id, { ...sub, sectionId: s.id }] as const))
);

export function sectionTitle(id: string): string {
  const section = SECTION_BY_ID.get(id);
  if (!section) throw new Error(`Unknown docs section: ${id}`);
  return section.title;
}

export function subsectionTitle(id: string): string {
  const sub = SUB_BY_ID.get(id);
  if (!sub) throw new Error(`Unknown docs subsection: ${id}`);
  return sub.title;
}

export function getSection(id: string): DocsSection | undefined {
  return SECTION_BY_ID.get(id);
}

/** The group a section belongs to ("Start", "Use it", ...). */
export function groupOf(id: string): string | undefined {
  return DOCS_NAV.find((g) => g.sections.some((s) => s.id === id))?.group;
}

/** The id of a page's `h1`. */
export function headingId(sectionId: string): string {
  return `${sectionId}-h`;
}

export function docsHref(sectionId: string): string {
  return `/docs/${sectionId}`;
}

/** The page the visitor is on, from the pathname, or null on the docs home. */
export function sectionIdFromPath(pathname: string): string | null {
  const m = /^\/docs\/([^/#?]+)/.exec(pathname);
  return m && SECTION_BY_ID.has(m[1]) ? m[1] : null;
}

/** The pages either side of this one, in reading order, across groups. */
export function neighbors(sectionId: string): { prev: DocsSection | null; next: DocsSection | null } {
  const i = DOCS_SECTIONS.findIndex((s) => s.id === sectionId);
  return {
    prev: i > 0 ? DOCS_SECTIONS[i - 1] : null,
    next: i >= 0 && i < DOCS_SECTIONS.length - 1 ? DOCS_SECTIONS[i + 1] : null,
  };
}

/**
 * Old links pointed at one long page (`/docs#servers`). Given such a hash id,
 * the page it lives on now, so a bookmark still lands in the right place.
 */
export function legacyHref(hashId: string): string | null {
  const id = hashId.replace(/^#/, "");
  if (SECTION_BY_ID.has(id)) return docsHref(id);
  const sub = SUB_BY_ID.get(id);
  if (sub) return `${docsHref(sub.sectionId)}#${id}`;
  if (id.endsWith("-h") && SECTION_BY_ID.has(id.slice(0, -2))) return docsHref(id.slice(0, -2));
  return null;
}

/** One line per page, for the docs home. */
export const SUMMARIES: Record<string, string> = {
  overview: "What Nest Deploy is and what happens on every push.",
  quickstart: "From nothing to a deployed app in four steps.",
  servers: "Connect a Nest account with a dedicated SSH key.",
  projects: "Settings, runtimes and what every app can rely on.",
  deployments: "States, rollbacks, restarts and how previews work.",
  env: "Encrypted variables per project and environment.",
  logs: "Build logs and runtime logs, with search.",
  domains: "Point your own domain at a port on your container.",
  github: "Deploy on push, and pull request previews.",
  hooks: "Start a deployment from CI or a script.",
  notifications: "Discord and Slack messages for deploys and outages.",
  monitoring: "Service status, resource use and uptime alerts.",
  "status-page": "A public page that says whether an app is up.",
  analytics: "Cookie-free page views for your site.",
  activity: "The change history, your sessions and deleting your account.",
  security: "How keys, builds and secrets are handled.",
  selfhost: "Run your own copy of Nest Deploy.",
  limits: "Every limit in one table.",
  troubleshooting: "What to check when a step fails.",
};
