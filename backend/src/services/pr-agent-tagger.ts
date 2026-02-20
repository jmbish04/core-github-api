/**
 * @file backend/src/services/pr-agent-tagger.ts
 * @description Utility service to detect which AI coding agent authored a PR
 *              and format agent-targeted comments for code review feedback.
 */

/** Known agent patterns for detection */
const AGENT_PATTERNS: Array<{
  agent: string;
  tag: string;
  branchPrefixes: string[];
  bodyMarkers: string[];
  commitAuthors: string[];
  userLogins: string[];
}> = [
  {
    agent: "claude",
    tag: "@claude",
    branchPrefixes: ["claude/", "claude-"],
    bodyMarkers: ["Co-authored-by: Claude", "claude-code", "anthropic"],
    commitAuthors: ["claude", "Claude"],
    userLogins: ["claude-code", "claude[bot]"],
  },
  {
    agent: "codex",
    tag: "@codex",
    branchPrefixes: ["codex/", "codex-"],
    bodyMarkers: ["Co-authored-by: Codex", "openai-codex"],
    commitAuthors: ["codex", "Codex"],
    userLogins: ["codex", "openai-codex"],
  },
  {
    agent: "copilot",
    tag: "@copilot",
    branchPrefixes: ["copilot/", "copilot-", "antigravity/", "antigravity-"],
    bodyMarkers: ["Co-authored-by: Copilot", "github-copilot", "antigravity"],
    commitAuthors: ["copilot", "Copilot", "antigravity", "Antigravity"],
    userLogins: ["copilot[bot]", "github-copilot[bot]"],
  },
  {
    agent: "jules",
    tag: "@jules",
    branchPrefixes: ["jules/", "jules-"],
    bodyMarkers: ["Co-authored-by: Jules", "jules-google", "@google/jules"],
    commitAuthors: ["jules", "Jules"],
    userLogins: ["jules[bot]", "jules-google[bot]"],
  },
  {
    agent: "devin",
    tag: "@devin",
    branchPrefixes: ["devin/", "devin-"],
    bodyMarkers: ["Co-authored-by: Devin", "devin-ai"],
    commitAuthors: ["devin", "Devin"],
    userLogins: ["devin-ai[bot]", "devin[bot]"],
  },
];

/** Known code review bot logins */
export const CODE_REVIEW_BOTS = [
  "gemini-code-assist[bot]",
  "google-code-assist",
  "coderabbitai[bot]",
  "coderabbit[bot]",
  "copilot[bot]",
  "github-actions[bot]",
  "codeclimate[bot]",
  "sonarcloud[bot]",
];

export interface AgentDetection {
  agent: string;
  tag: string;
}

export interface PRContext {
  headRef?: string;
  body?: string | null;
  authorLogin?: string;
  commits?: Array<{ author?: { name?: string; login?: string } }>;
}

/**
 * Detect which AI coding agent authored a PR based on branch name,
 * PR body markers, commit author names, and PR author login.
 */
export function detectPRAuthorAgent(pr: PRContext): AgentDetection | null {
  for (const pattern of AGENT_PATTERNS) {
    // Check branch name
    if (pr.headRef) {
      const branch = pr.headRef.toLowerCase();
      for (const prefix of pattern.branchPrefixes) {
        if (branch.startsWith(prefix) || branch.includes(`/${prefix}`)) {
          return { agent: pattern.agent, tag: pattern.tag };
        }
      }
    }

    // Check PR body
    if (pr.body) {
      for (const marker of pattern.bodyMarkers) {
        if (pr.body.toLowerCase().includes(marker.toLowerCase())) {
          return { agent: pattern.agent, tag: pattern.tag };
        }
      }
    }

    // Check author login
    if (pr.authorLogin) {
      for (const login of pattern.userLogins) {
        if (pr.authorLogin.toLowerCase() === login.toLowerCase()) {
          return { agent: pattern.agent, tag: pattern.tag };
        }
      }
    }

    // Check commit authors
    if (pr.commits) {
      for (const commit of pr.commits) {
        const authorName = commit.author?.name || commit.author?.login || "";
        for (const ca of pattern.commitAuthors) {
          if (authorName.toLowerCase() === ca.toLowerCase()) {
            return { agent: pattern.agent, tag: pattern.tag };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Check if a user login is a known code review bot.
 */
export function isCodeReviewBot(login: string): boolean {
  const normalized = login.toLowerCase();
  return CODE_REVIEW_BOTS.some(
    (bot) =>
      normalized === bot.toLowerCase() ||
      normalized.includes("bot") ||
      normalized.includes("assist")
  );
}

export interface ExtractedReviewComment {
  path: string;
  line: number | null;
  body: string;
  diff_hunk?: string;
  suggestion?: string;
}

/**
 * Format extracted code review comments into an agent-targeted fix comment.
 */
export function formatAgentFixComment(
  agentTag: string,
  prNumber: number,
  comments: ExtractedReviewComment[]
): string {
  let body = `${agentTag} fix all code_comments from the automated code review on PR #${prNumber}:\n\n`;

  // Group by file
  const byFile: Record<string, ExtractedReviewComment[]> = {};
  for (const c of comments) {
    if (!byFile[c.path]) byFile[c.path] = [];
    byFile[c.path].push(c);
  }

  for (const [file, fileComments] of Object.entries(byFile)) {
    body += `### File: \`${file}\`\n\n`;
    for (const c of fileComments) {
      body += `**Line ${c.line || "N/A"}:**\n`;
      if (c.diff_hunk) {
        // Show last 3 lines of diff for context
        const hunkLines = c.diff_hunk.split("\n").slice(-3).join("\n");
        body += "```diff\n" + hunkLines + "\n```\n";
      }
      body += `> ${c.body.replace(/\n/g, "\n> ")}\n\n`;
      if (c.suggestion) {
        body += "**Suggested fix:**\n```\n" + c.suggestion + "\n```\n\n";
      }
      body += "---\n\n";
    }
  }

  return body;
}
