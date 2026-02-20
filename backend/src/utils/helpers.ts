// Helper to sanitize repo name for use as agent name
export function sanitizeRepoName(fullName: string): string {
  // Replace "/" with "-" and remove any other problematic characters
  return fullName
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
