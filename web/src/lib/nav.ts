import type { Icon } from "@phosphor-icons/react";
import {
  ChartLineUpIcon,
  ClockCounterClockwiseIcon,
  GaugeIcon,
  CubeIcon,
  GearSixIcon,
  BookOpenTextIcon,
  FolderOpenIcon,
  TerminalWindowIcon,
  CubeFocusIcon,
  GlobeSimpleIcon,
  HardDrivesIcon,
  HouseLineIcon,
  ListDashesIcon,
  PlusIcon,
  SquaresFourIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  /** Returns true when this item should be marked current for the pathname. */
  active: (pathname: string) => boolean;
};

export type NavContext = {
  /** Text shown centred in the top bar on phones, and the single crumb on team pages. */
  title: string;
  /** Desktop breadcrumb label for the page inside a project ("Overview", "Deployments"...). */
  crumb?: string;
  /** Short deployment id on the deployment detail page. */
  deploymentId?: string;
  /** Where the phone's back chevron goes, if this is a nested page. */
  backHref?: string;
  /** Label for the sidebar's way back to the team level. */
  backLabel?: string;
  items: NavItem[];
  project?: { slug: string; name: string };
};

const TEAM_ITEMS: NavItem[] = [
  {
    href: "/projects",
    label: "Projects",
    icon: SquaresFourIcon,
    active: (p) => p === "/projects",
  },
  {
    href: "/deployments",
    label: "Deployments",
    icon: CubeIcon,
    active: (p) => p.startsWith("/deployments"),
  },
  {
    href: "/logs",
    label: "Logs",
    icon: ListDashesIcon,
    active: (p) => p.startsWith("/logs"),
  },
  {
    href: "/resources",
    label: "Resources",
    icon: GaugeIcon,
    active: (p) => p.startsWith("/resources"),
  },
  {
    href: "/domains",
    label: "Domains",
    icon: GlobeSimpleIcon,
    active: (p) => p.startsWith("/domains"),
  },
  {
    href: "/activity",
    label: "Activity",
    icon: ClockCounterClockwiseIcon,
    active: (p) => p.startsWith("/activity"),
  },
  {
    href: "/container",
    label: "Container",
    icon: CubeFocusIcon,
    active: (p) => p.startsWith("/container"),
  },
  {
    href: "/connect",
    label: "Connect",
    icon: HardDrivesIcon,
    active: (p) => p.startsWith("/connect"),
  },
];

const TEAM_TITLES: Record<string, string> = {
  "/projects": "Projects",
  "/deployments": "Deployments",
  "/logs": "Logs",
  "/resources": "Resources",
  "/domains": "Domains",
  "/activity": "Activity",
  "/container": "Container",
  "/connect": "Connect a Server",
};

function projectItems(slug: string): NavItem[] {
  const base = `/projects/${slug}`;
  return [
    {
      href: base,
      label: "Overview",
      icon: HouseLineIcon,
      active: (p) => p === base,
    },
    {
      href: `${base}/deployments`,
      label: "Deployments",
      icon: CubeIcon,
      active: (p) => p.startsWith(`${base}/deployments`),
    },
    {
      href: `${base}/analytics`,
      label: "Analytics",
      icon: ChartLineUpIcon,
      active: (p) => p.startsWith(`${base}/analytics`),
    },
    {
      href: `${base}/files`,
      label: "Files",
      icon: FolderOpenIcon,
      active: (p) => p.startsWith(`${base}/files`),
    },
    {
      href: `${base}/terminal`,
      label: "Terminal",
      icon: TerminalWindowIcon,
      active: (p) => p.startsWith(`${base}/terminal`),
    },
    {
      href: `${base}/settings`,
      label: "Settings",
      icon: GearSixIcon,
      active: (p) => p.startsWith(`${base}/settings`),
    },
  ];
}

export function navFor(pathname: string): NavContext {
  const match = pathname.match(/^\/projects\/([^/]+)(\/.*)?$/);

  if (match) {
    const slug = match[1];
    const rest = match[2] ?? "";
    const name = slug;

    let title = "Project Overview";
    let crumb = "Overview";
    let deploymentId: string | undefined;
    let backHref = "/projects";
    if (rest.startsWith("/deployments/")) {
      title = "Deployment";
      crumb = "Deployment";
      deploymentId = rest.split("/")[2]?.slice(0, 8);
      backHref = `/projects/${slug}/deployments`;
    } else if (rest.startsWith("/analytics")) {
      title = "Project Analytics";
      crumb = "Analytics";
      backHref = `/projects/${slug}`;
    } else if (rest.startsWith("/files")) {
      title = "Files";
      backHref = `/projects/${slug}`;
    } else if (rest.startsWith("/terminal")) {
      title = "Terminal";
      backHref = `/projects/${slug}`;
    } else if (rest.startsWith("/settings")) {
      title = "Project Settings";
      crumb = "Settings";
      backHref = `/projects/${slug}`;
    } else if (rest.startsWith("/deployments")) {
      title = "Project Deployments";
      crumb = "Deployments";
      backHref = `/projects/${slug}`;
    } else {
      backHref = "/projects";
    }

    return {
      title,
      crumb,
      deploymentId,
      backHref,
      backLabel: "All Projects",
      items: projectItems(slug),
      project: { slug, name },
    };
  }

  if (pathname.startsWith("/account")) {
    return { title: "Account", backHref: "/projects", items: TEAM_ITEMS };
  }

  const known = TEAM_ITEMS.find((i) => i.active(pathname));
  return {
    title: TEAM_TITLES[known?.href ?? "/projects"] ?? "Nest Deploy",
    backHref: pathname === "/projects" ? undefined : "/projects",
    items: TEAM_ITEMS,
  };
}

export type FindTarget = {
  href: string;
  label: string;
  group: string;
  /** Leading icon for pages. Projects use a PixelAvatar seeded with `seed`. */
  icon?: Icon;
  seed?: string;
};

/** Everything the Find palette can jump to. */
export function findTargets(
  projects: { slug: string; name: string }[]
): FindTarget[] {
  return [
    ...TEAM_ITEMS.map((i) => ({
      href: i.href,
      label: i.label,
      group: "Pages",
      icon: i.icon,
    })),
    { href: "/account", label: "Account", group: "Pages", icon: UserCircleIcon },
    { href: "/new", label: "New project", group: "Pages", icon: PlusIcon },
    { href: "/docs", label: "Docs", group: "Pages", icon: BookOpenTextIcon },
    ...projects.map((p) => ({
      href: `/projects/${p.slug}`,
      label: p.name,
      group: "Projects",
      seed: p.slug,
    })),
  ];
}
