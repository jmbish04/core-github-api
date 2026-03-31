/**
 * Utility to filter out files that do not need AI PR review (e.g. lockfiles, assets).
 */
export function shouldReviewFile(filename: string): boolean {
  const ignorePatterns = [
    /pnpm-lock\.yaml$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.gif$/,
    /\.svg$/,
    /\.ico$/,
    /\.map$/,
    /dist\//,
    /build\//,
    /coverage\//,
    /\.min\.(js|css)$/,
    /\.DS_Store$/,
    /\.idea\//,
    /\.vscode\//
  ];

  return !ignorePatterns.some(pattern => pattern.test(filename));
}

export function filterFilesForReview(files: any[]): any[] {
  return files.filter(file => shouldReviewFile(file.filename));
}
