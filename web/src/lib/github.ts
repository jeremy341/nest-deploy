const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;
const SHA = /^[0-9a-f]{7,40}$/i;

/**
 * The GitHub page for one commit, or null when the repository or the SHA is
 * missing or malformed. The result is only ever built from validated parts, so
 * it is safe to use as an href.
 */
export function commitUrl(repo: string | null | undefined, sha: string | null | undefined): string | null {
  if (!repo || !sha) return null;
  if (!REPO.test(repo) || repo.endsWith(".") || repo.split("/")[1] === "..") return null;
  if (!SHA.test(sha)) return null;
  return `https://github.com/${repo}/commit/${sha.toLowerCase()}`;
}
