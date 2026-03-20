export function includesCloudflareWorker(files: string[]): boolean {
  return files.some(
    (file) =>
      file.endsWith('wrangler.toml') ||
      file.endsWith('wrangler.json') ||
      file.endsWith('wrangler.jsonc'),
  );
}