/** Shown inside the app frame while a page loads its data. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton-sweep h-9 w-56 rounded-md" />
      <div className="skeleton-sweep mt-6 h-64 w-full rounded-lg" />
    </div>
  );
}
