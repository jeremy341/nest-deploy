import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingRegion, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { CONTENT } from "../_content/sections";
import { OnThisPage } from "../_components/on-this-page";
import { PrevNext } from "../_components/prev-next";
import { DOCS_SECTIONS, getSection, SUMMARIES } from "../_data/nav";

type Props = { params: Promise<{ slug: string }> };

/** Every page is known ahead of time, so they can all be built up front. */
export function generateStaticParams() {
  return DOCS_SECTIONS.map((s) => ({ slug: s.id }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const section = getSection(slug);
  return section ? { title: section.title, description: SUMMARIES[slug] } : {};
}

/** A page's shape while it loads: the title, the intro, then paragraphs and a block. */
function DocsPageSkeleton() {
  return (
    <LoadingRegion label="Loading…" className="max-w-[760px]">
      <SkeletonText size="title-1" width="w-56" />
      <SkeletonText size="body" width="w-full" lines={2} className="mt-3" />
      <SkeletonText size="title-3" width="w-48" className="mt-10" />
      <SkeletonText size="body" width="w-full" lines={4} className="mt-4" />
      <Skeleton className="mt-6 h-40 w-full" />
    </LoadingRegion>
  );
}

export default function DocsPage({ params }: Props) {
  return (
    <Suspense fallback={<DocsPageSkeleton />}>
      <DocsPageContent params={params} />
    </Suspense>
  );
}

async function DocsPageContent({ params }: Props) {
  const { slug } = await params;
  const section = getSection(slug);
  const content = CONTENT[slug];
  if (!section || !content) notFound();

  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_200px] xl:gap-12">
      <article id="docs-article" tabIndex={-1} className="max-w-[760px] min-w-0 scroll-mt-24 outline-none">
        {content()}
        <PrevNext sectionId={slug} />
      </article>
      <OnThisPage items={section.subsections} />
    </div>
  );
}
