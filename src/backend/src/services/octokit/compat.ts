type EndpointGroup =
  | "repos"
  | "issues"
  | "git"
  | "pulls"
  | "search"
  | "checks"
  | "actions";

const ENDPOINT_GROUPS: EndpointGroup[] = [
  "repos",
  "issues",
  "git",
  "pulls",
  "search",
  "checks",
  "actions",
];

/**
 * Normalizes installation-scoped Octokit clients so legacy access patterns
 * (e.g. octokit.repos.getContent) continue to work when only
 * octokit.rest.repos is available.
 */
export function withCompatOctokit<T extends Record<string, any>>(client: T): T {
  const rest = client?.rest as Record<string, any> | undefined;
  if (!rest) return client;

  for (const group of ENDPOINT_GROUPS) {
    if (!client[group] && rest[group]) {
      (client as Record<string, any>)[group] = rest[group];
    }
  }

  return client;
}

