// GitHub webhook event types
// See: https://docs.github.com/en/webhooks/webhook-events-and-payloads

export type GitHubEventType =
  | "push"
  | "pull_request"
  | "pull_request_review"
  | "pull_request_review_comment"
  | "issues"
  | "issue_comment"
  | "star"
  | "fork"
  | "watch"
  | "create"
  | "delete"
  | "release"
  | "ping"
  | "check_run"
  | "check_suite"
  | "installation"
  | "installation_repositories"
  | "repository"
  | "workflow_run"
  | "workflow_job"
  | "status"
  | (string & {}); // Allow unknown event types as fallback

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  visibility?: "public" | "private" | "internal";
}

export interface GitHubCommit {
  id: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  url: string;
  timestamp: string;
}

export interface GitHubPushPayload {
  ref: string;
  before: string;
  after: string;
  commits: GitHubCommit[];
  pusher: { name: string; email: string };
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft?: boolean;
  html_url: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GitHubPullRequestPayload {
  action:
    | "opened"
    | "closed"
    | "reopened"
    | "synchronize"
    | "edited"
    | "review_requested"
    | "ready_for_review";
  number: number;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  user: GitHubUser;
  labels: Array<{ name: string; color: string }>;
  assignee?: GitHubUser | null;
  milestone?: { id: number } | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
}

export interface GitHubIssuesPayload {
  action: "opened" | "closed" | "reopened" | "edited" | "labeled" | "unlabeled" | "assigned" | "unassigned";
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubIssueCommentPayload {
  action: "created" | "edited" | "deleted";
  issue: GitHubIssue;
  comment: {
    id: number;
    body: string;
    user: GitHubUser;
    created_at: string;
    html_url: string;
  };
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubStarPayload {
  action: "created" | "deleted";
  starred_at: string | null;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubForkPayload {
  forkee: GitHubRepository;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubReleasePayload {
  action: "published" | "created" | "edited" | "deleted";
  release: {
    id: number;
    tag_name: string;
    name: string | null;
    body: string | null;
    html_url: string;
    author: GitHubUser;
    created_at: string;
    published_at: string | null;
  };
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubPingPayload {
  zen: string;
  hook_id: number;
  hook: {
    type: string;
    id: number;
    events: string[];
    active: boolean;
  };
  repository: GitHubRepository;
  sender: GitHubUser;
}

// --- Installation event payloads ---

export interface GitHubInstallationPayload {
  action: "created" | "deleted" | "suspend" | "unsuspend" | "new_permissions_accepted";
  installation: {
    id: number;
    account: GitHubUser & { html_url: string };
    html_url: string;
    app_id: number;
    events: string[];
  };
  repositories?: Array<{ id: number; name: string; full_name: string }>;
  sender: GitHubUser;
}

export interface GitHubInstallationRepositoriesPayload {
  action: "added" | "removed";
  installation: {
    id: number;
    account: GitHubUser & { html_url: string };
  };
  repositories_added: Array<{ id: number; name: string; full_name: string }>;
  repositories_removed: Array<{ id: number; name: string; full_name: string }>;
  sender: GitHubUser;
}

// --- Webhook payload union ---

export type GitHubWebhookPayload =
  | GitHubPushPayload
  | GitHubPullRequestPayload
  | GitHubIssuesPayload
  | GitHubIssueCommentPayload
  | GitHubStarPayload
  | GitHubForkPayload
  | GitHubReleasePayload
  | GitHubPingPayload
  | GitHubInstallationPayload
  | GitHubInstallationRepositoriesPayload;

// --- Stored event format ---

export interface StoredEvent {
  id: string;
  type: GitHubEventType;
  action?: string;
  title: string;
  description: string;
  url: string;
  actor: {
    login: string;
    avatar_url: string;
  };
  timestamp: string;
  /** Present on OwnerAgent events to indicate which repo triggered the event */
  repo_name?: string;
}

// --- Shared RepoState ---

export type RepoState = {
  repoFullName: string;
  stats: {
    stars: number;
    forks: number;
    openIssues: number;
  };
  lastUpdated: string | null;
  webhookConfigured: boolean;
};
