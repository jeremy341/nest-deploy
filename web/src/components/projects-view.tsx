"use client";

import { useState } from "react";
import Link from "next/link";
import {
  GitBranchIcon,
  HardDrivesIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { Stagger } from "@/components/motion/stagger";
import { ProjectCard } from "@/components/project-card";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { ProjectView } from "@/server/queries";
import { cn } from "@/lib/utils";

type View = "grid" | "list";

export function ProjectsView({
  projects,
  hasServer,
}: {
  projects: ProjectView[];
  hasServer: boolean;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");

  if (!hasServer) {
    return (
      <EmptyState
        icon={<HardDrivesIcon />}
        title="Connect your Nest server"
        description="Add a dedicated SSH key in the Nest dashboard and Nest Deploy can start deploying to your container."
        action={
          <Button render={<Link href="/connect" />}>Connect a server</Button>
        }
      />
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<GitBranchIcon />}
        title="No projects yet"
        description="Import a GitHub repository and it will be built and run on your Nest server."
        action={<Button render={<Link href="/new" />}>Add your first project</Button>}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const visible = q
    ? projects.filter((p) =>
        [p.name, p.repo ?? "", p.repoUrl, ...p.domains, p.lastCommit ?? ""].some((field) =>
          field.toLowerCase().includes(q)
        )
      )
    : projects;

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-sm:basis-full">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search projects"
            placeholder="Search projects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Segmented<View>
          label="Layout"
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: "Grid view", icon: <SquaresFourIcon />, iconOnly: true },
            { value: "list", label: "List view", icon: <ListIcon />, iconOnly: true },
          ]}
        />
        <Button className="h-9 px-3 max-sm:h-10" render={<Link href="/new" />}>
          Add New
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg bg-card px-4 shadow-border-small">
          <EmptyState
            size="compact"
            icon={<MagnifyingGlassIcon />}
            title={`No projects match “${query}”`}
            description="Try a project name, repository, or domain."
            action={
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        </div>
      ) : null}

      {/* One Stagger for the page's life, so a search or a view switch never replays the entrance. */}
      <div className="@container">
        <Stagger
          aria-label="Projects"
          className={cn(
            visible.length === 0 && "hidden",
            view === "grid"
              ? "grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3"
              : "hairline-y overflow-hidden rounded-lg bg-card shadow-border-small"
          )}
        >
          {visible.map((project) => (
            <li
              key={project.id}
              className={cn("min-w-0", view === "list" && "row-focus")}
            >
              <ProjectCard project={project} variant={view === "list" ? "row" : "card"} />
            </li>
          ))}
        </Stagger>
      </div>
    </div>
  );
}
