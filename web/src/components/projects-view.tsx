"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { ProjectCard } from "@/components/project-card";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Project } from "@/lib/mock";

type View = "grid" | "list";

export function ProjectsView({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");

  const q = query.trim().toLowerCase();
  const visible = q
    ? projects.filter((p) =>
        [p.name, p.repo, p.domain, p.commit].some((field) =>
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
            {
              value: "grid",
              label: "Grid view",
              icon: <SquaresFourIcon />,
              iconOnly: true,
            },
            {
              value: "list",
              label: "List view",
              icon: <ListIcon />,
              iconOnly: true,
            },
          ]}
        />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button className="h-9 px-3" />}>
            Add New
            <PlusIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem render={<Link href="/connect" />}>
              Connect a server
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/domains" />}>
              Domain
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="font-medium">No projects match “{query}”</p>
          <p className="mt-1 text-muted-foreground">
            Try a project name, repository, or domain.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setQuery("")}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <ul
          className={
            view === "grid"
              ? "grid gap-4 md:grid-cols-2"
              : "flex flex-col gap-3"
          }
        >
          {visible.map((project) => (
            <li key={project.slug} className="min-w-0">
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
