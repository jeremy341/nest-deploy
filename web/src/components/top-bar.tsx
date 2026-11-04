"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretLeftIcon, PlusIcon } from "@phosphor-icons/react";
import { useAccount } from "@/components/account-context";
import { NestMark } from "@/components/nest-mark";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { navFor } from "@/lib/nav";

const crumbLink =
  "rounded-md px-2 py-1 text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground";

function Separator() {
  return (
    <li aria-hidden="true" className="text-[var(--ds-gray-alpha-500)]">
      /
    </li>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const ctx = navFor(pathname);
  const { projects } = useAccount();
  const project = ctx.project
    ? {
        slug: ctx.project.slug,
        name: projects.find((p) => p.slug === ctx.project?.slug)?.name ?? ctx.project.name,
      }
    : null;

  return (
    <header className="sticky top-0 z-(--z-topbar) flex h-[var(--topbar-height)] shrink-0 items-center border-b bg-background-subtle px-4 lg:px-6">
      {/* Phones: back chevron, or the Nest mark when there is nowhere back to go. */}
      <div className="flex items-center lg:hidden">
        {ctx.backHref ? (
          <Link
            href={ctx.backHref}
            aria-label="Back"
            className="-ml-2 flex size-10 items-center justify-center rounded-md text-foreground transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]"
          >
            <CaretLeftIcon aria-hidden="true" className="size-5" />
          </Link>
        ) : (
          <Link
            href="/projects"
            aria-label="Nest Deploy home"
            className="-ml-2 flex size-10 items-center justify-center rounded-md transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]"
          >
            <NestMark className="size-6" />
          </Link>
        )}
      </div>

      {/* Desktop: breadcrumb. */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 lg:block">
        <ol className="flex min-w-0 items-center gap-1 font-medium tracking-[-0.02em]">
          {project ? (
            <>
              <li>
                <Link href="/projects" className={crumbLink}>
                  Projects
                </Link>
              </li>
              <Separator />
              <li className="min-w-0">
                <ProjectSwitcher slug={project.slug} name={project.name} />
              </li>
              <Separator />
              <li className="min-w-0 truncate px-2" aria-current="page">
                {ctx.crumb}
                {ctx.deploymentId ? (
                  <span className="ml-2 font-mono text-[13px] text-muted-foreground">
                    {ctx.deploymentId}
                  </span>
                ) : null}
              </li>
            </>
          ) : (
            <li className="px-2" aria-current="page">
              {ctx.title}
            </li>
          )}
        </ol>
      </nav>

      {/* Phones: the page title, centred. */}
      <p className="pointer-events-none absolute left-1/2 max-w-[50%] -translate-x-1/2 truncate font-medium tracking-[-0.02em] lg:hidden">
        {ctx.title}
      </p>

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="gap-1.5 px-2 font-medium tracking-[-0.02em] max-lg:size-10 max-lg:px-0"
              />
            }
          >
            <PlusIcon aria-hidden="true" />
            <span className="max-lg:sr-only">Create New</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem render={<Link href="/new" />}>
              Project
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/domains" />}>
              Domain
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/connect" />}>
              Connect a server
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** The 56px bar with no data: a crumb bar on desktop, a block and a title bar on phones. */
export function TopBarSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-(--z-topbar) flex h-[var(--topbar-height)] shrink-0 items-center border-b bg-background-subtle px-4 lg:px-6"
    >
      <Skeleton className="-ml-2 size-10 lg:hidden" />
      <Skeleton className="hidden h-4 w-40 lg:block" />
      <Skeleton className="absolute left-1/2 h-4 w-24 -translate-x-1/2 lg:hidden" />
    </div>
  );
}
