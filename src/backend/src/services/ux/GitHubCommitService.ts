/**
 * @file src/services/ux/GitHubCommitService.ts
 * @description Commits text/binary files to a GitHub repository branch using
 * the Octokit Git Data API. Used by UxDesignAgent to persist Stitch HTML
 * and screenshots that Jules later references when rebuilding pages.
 */
import { Octokit } from '@octokit/rest';

export interface CommitFileResult {
  sha: string;
  path: string;
  url: string;
}

export class GitHubCommitService {
  private octokit: Octokit;

  constructor(githubToken: string) {
    this.octokit = new Octokit({ auth: githubToken });
  }

  /**
   * Returns the default branch name for a repo.
   */
  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const { data } = await this.octokit.rest.repos.get({ owner, repo });
    return data.default_branch;
  }

  /**
   * Commits a single UTF-8 text file to the repo.
   * Creates the file if it doesn't exist; overwrites if it does.
   */
  async commitTextFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch?: string,
  ): Promise<CommitFileResult> {
    const targetBranch = branch ?? (await this.getDefaultBranch(owner, repo));

    // Check if file already exists (needed for SHA to update)
    let existingSha: string | undefined;
    try {
      const { data } = await this.octokit.rest.repos.getContent({ owner, repo, path, ref: targetBranch });
      if (!Array.isArray(data) && data.type === 'file') {
        existingSha = data.sha;
      }
    } catch {
      // File doesn't exist yet — that's fine
    }

    const { data } = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: targetBranch,
      ...(existingSha ? { sha: existingSha } : {}),
    });

    return {
      sha: data.commit.sha ?? '',
      path,
      url: data.content?.html_url ?? '',
    };
  }

  /**
   * Commits a PNG screenshot from a URL to GitHub.
   * Fetches the image bytes from the URL then commits as base64.
   */
  async commitScreenshotFromUrl(
    owner: string,
    repo: string,
    path: string,
    screenshotUrl: string,
    message: string,
    branch?: string,
  ): Promise<CommitFileResult> {
    const response = await fetch(screenshotUrl);
    if (!response.ok) throw new Error(`Failed to fetch screenshot from ${screenshotUrl}: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const targetBranch = branch ?? (await this.getDefaultBranch(owner, repo));

    let existingSha: string | undefined;
    try {
      const { data } = await this.octokit.rest.repos.getContent({ owner, repo, path, ref: targetBranch });
      if (!Array.isArray(data) && data.type === 'file') existingSha = data.sha;
    } catch {
      // New file
    }

    const { data } = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: base64,
      branch: targetBranch,
      ...(existingSha ? { sha: existingSha } : {}),
    });

    return {
      sha: data.commit.sha ?? '',
      path,
      url: data.content?.html_url ?? '',
    };
  }

  /**
   * Commits both the HTML and screenshot for a Stitch page result in one call.
   * Returns both commit SHAs.
   */
  async commitStitchPage(params: {
    owner: string;
    repo: string;
    stitchProjectId: string;
    pageName: string;
    html: string;
    screenshotUrl?: string;
    branch?: string;
  }): Promise<{ htmlPath: string; screenshotPath: string | null; sha: string }> {
    const basePath = `StitchSessions/${params.stitchProjectId}/${params.pageName}`;
    const htmlPath = `${basePath}/page.html`;

    const htmlResult = await this.commitTextFile(
      params.owner,
      params.repo,
      htmlPath,
      params.html,
      `chore(stitch): add ${params.pageName} mockup HTML [${params.stitchProjectId}]`,
      params.branch,
    );

    let screenshotPath: string | null = null;
    if (params.screenshotUrl) {
      try {
        const ssPath = `${basePath}/screenshot.png`;
        await this.commitScreenshotFromUrl(
          params.owner,
          params.repo,
          ssPath,
          params.screenshotUrl,
          `chore(stitch): add ${params.pageName} screenshot [${params.stitchProjectId}]`,
          params.branch,
        );
        screenshotPath = ssPath;
      } catch (err: any) {
        // Non-fatal — screenshot commit failure shouldn't block the pipeline
        console.warn(`Screenshot commit failed for ${params.pageName}:`, err.message);
      }
    }

    return { htmlPath, screenshotPath, sha: htmlResult.sha };
  }
}
