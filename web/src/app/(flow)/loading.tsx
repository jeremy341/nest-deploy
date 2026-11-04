/** Shown while the import flow loads your servers and GitHub state. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="mx-auto w-full max-w-[600px]">
      <div className="skeleton-sweep h-96 w-full rounded-lg" />
    </div>
  );
}
