"use client";

import { useState } from "react";
import Link from "next/link";
import {
  HardDrivesIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { ProjectCard } from "@/components/project-card";
import { Segmented } from "@/components/segmented";
import { Button, buttonVariants } from "@/components/ui/button";
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
      <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
        <HardDrivesIcon className="size-8 text-muted-foreground" />
        <p className="mt-3 text-lg font-semibold tracking-[-0.02em]">Connect your Nest server</p>
        <p className="mt-1 max-w-[46ch] text-muted-foreground">
          Add a dedicated SSH key in the Nest dashboard and Nest Deploy can start deploying to
          your container.
        </p>
        <Link href="/connect" className={cn(buttonVariants(), "mt-5 h-10 px-4")}>
          Connect a server
        </Link>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
        <p className="text-lg font-semibold tracking-[-0.02em]">No projects yet</p>
        <p className="mt-1 max-w-[46ch] text-muted-foreground">
          Import a GitHub repository and it will be built and run on your Nest server.
        </p>
        <Link href="/new" className={cn(buttonVariants(), "mt-5 h-10 px-4")}>
          Add your first project
        </Link>
      </div>
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
        <div className="relative min-w-[200px] flex-1">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search projects"
            placeholder="Search projects..."
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
        <Link href="/new" className={cn(buttonVariants({ variant: "brand" }), "h-9 px-3")}>
          Add New
          <PlusIcon />
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="font-medium">No projects match “{query}”</p>
          <p className="mt-1 text-muted-foreground">
            Try a project name, repository, or domain.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <ul
          className={
            view === "grid" ? "grid gap-4 min-[1500px]:grid-cols-2" : "flex flex-col gap-3"
          }
        >
          {visible.map((project) => (
            <li key={project.id} className="min-w-0">
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
