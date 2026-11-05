"use server";

import { queryActivity, type ActivityPage } from "@/server/activity-query";
import { PAGE_SIZE, parseFilters } from "@/server/activity";
import { requireUser } from "@/server/auth/current";

/** The next page of the signed-in user's activity, with the same filters as the page. */
export async function loadMoreActivity(input: {
  kind: string;
  range: string;
  q: string;
  cursor: string;
}): Promise<ActivityPage> {
  const user = await requireUser();
  // Filters are re-validated here: this is a public endpoint, whatever the page sent.
  const filters = parseFilters({ kind: input.kind, range: input.range, q: input.q });
  return queryActivity(user.id, filters, { limit: PAGE_SIZE, cursor: String(input.cursor ?? "") });
}
