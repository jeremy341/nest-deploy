import type { Icon } from "@phosphor-icons/react";
import {
  CubeIcon,
  GearSixIcon,
  GlobeSimpleIcon,
  HardDrivesIcon,
  ListDashesIcon,
  SquaresFourIcon,
  TriangleIcon,
} from "@phosphor-icons/react";

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  /** Returns true when this item should be marked current for the pathname. */
  active: (pathname: string) => boolean;
};

export type NavContext = {
  /** Text shown centred in the top bar. */
  title: string;
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
    href: "/domains",
    label: "Domains",
    icon: GlobeSimpleIcon,
    active: (p) => p.startsWith("/domains"),
  },
  {
    href: "/connect",
    label: "Connect",
    icon: HardDrivesIcon,
    active: (p) => p.startsWith("/connect"),
  },
];

const TEAM_TITLES: Record<string, string> = {
  "/projects": "Overview",
  "/deployments": "Deployments",
  "/logs": "Logs",
  "/domains": "Domains",
  "/connect": "Connect a Server",
};

function projectItems(slug: string): NavItem[] {
  const base = `/projects/${slug}`;
  return [
    {
      href: base,
      label: "Overview",
      icon: TriangleIcon,
      active: (p) => p === base,
    },
    {
      href: `${base}/deployments`,
      label: "Deployments",
      icon: CubeIcon,
      active: (p) => p.startsWith(`${base}/deployments`),
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
    let backHref = "/projects";
    if (rest.startsWith("/deployments/")) {
      title = "Deployment";
      backHref = `/projects/${slug}/deployments`;
    } else if (rest.startsWith("/settings")) {
      title = "Project Settings";
      backHref = `/projects/${slug}`;
    } else if (rest.startsWith("/deployments")) {
      title = "Project Deployments";
      backHref = `/projects/${slug}`;
    } else {
      backHref = "/projects";
    }

    return {
      title,
      backHref,
      backLabel: "All Projects",
      items: projectItems(slug),
      project: { slug, name },
    };
  }

  const known = TEAM_ITEMS.find((i) => i.active(pathname));
  return {
    title: TEAM_TITLES[known?.href ?? "/projects"] ?? "Nest Deploy",
    backHref: pathname === "/projects" ? undefined : "/projects",
    items: TEAM_ITEMS,
  };
}

/** Everything the Find palette can jump to. */
export function findTargets(
  projects: { slug: string; name: string }[]
): { href: string; label: string; group: string }[] {
  return [
    ...TEAM_ITEMS.map((i) => ({ href: i.href, label: i.label, group: "Pages" })),
    ...projects.map((p) => ({
      href: `/projects/${p.slug}`,
      label: p.name,
      group: "Projects",
    })),
  ];
}
