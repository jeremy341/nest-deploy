import { GenericSkeleton } from "@/components/skeletons/generic";

/** Shown inside the app frame for any route without its own loading state. */
export default function Loading() {
  return <GenericSkeleton />;
}
