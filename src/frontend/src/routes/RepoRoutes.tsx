/**
 * RepoRoutes.tsx
 * ─────────────────────────────────────────────────────────────────
 * SCOPE: ACTIVE WORKSPACE (REPO-SPECIFIC) — routes confined to a
 *        selected GitHub owner/repo pair.
 *
 * Parent route: <Route path="/repos/:owner/:repo" element={guard(<RepoLayout />)}>
 * All child <Route> paths here are RELATIVE (no leading slash, no "repos/:owner/:repo/" prefix).
 * React Router v6 automatically prepends the parent path segment.
 *
 * RULE: Never repeat the parent path prefix in any child route.
 *       API calls inside these views must target /api/repos/:owner/:repo/* endpoints.
 *       For cross-repo views, see @/routes/GlobalRoutes.tsx.
 * ─────────────────────────────────────────────────────────────────
 */

import { Route, Navigate } from "react-router-dom";
import React from "react";
import { RequireAuth } from "@/components/RequireAuth";

// Layouts
import RepoLayout from "@/layouts/RepoLayout";

// Repo-scoped views (dedicated per-repo implementations)

import RepoStats from "@/views/repos/Stats";
import RepoExplorer from "@/views/repos/Explorer";
import RepoPlan from "@/views/repos/Plan";
import RepoPRs from "@/views/repos/PRs";
import RepoTools from "@/views/repos/Tools";
import RepoCloudflareSDK from "@/views/repos/CloudflareSDK";
import RepoVibeSDK from "@/views/repos/VibeSDK";
import RepoUxWorkshop from "@/views/repos/UxWorkshop";
import RepoComponentIdentifier from "@/views/repos/ComponentIdentifier";
import RepoCloudfareDocs from "@/views/repos/CloudflareDocs";

// Global views reused in repo context (scoped by RepoLayout context provider)
// These components read owner/repo from useParams() and filter API results accordingly.
// TODO: Create dedicated repo-scoped variants as the product matures.
import Projects from "@/views/control/global/Projects";
import ProjectView from "@/views/repos/Overview";
import Kanban from "@/views/control/global/Kanban";
import Roadmap from "@/views/control/global/Roadmap";
import Todo from "@/views/control/global/Todo";
import TaskDetails from "@/views/control/global/TaskDetails";
import ReverseEngineering from "@/views/control/global/ReverseEngineering";
import ReverseEngineeringSnapshot from "@/views/control/global/ReverseEngineeringSnapshot";
import AgentWorkshop from "@/views/control/global/AgentWorkshop";
import { GlobalCommandCenter } from "@/components/workshop/GlobalCommandCenter";
import { WorkshopTakeover } from "@/components/workshop/WorkshopTakeover";
import Chat from "@/views/control/global/Chat";
import CloudflareChat from "@/views/control/global/CloudflareChat";
import CloudflareDocsInfo from "@/views/public/CloudflareDocsInfo";
import { PRCommandCenter } from "@/views/control/global/PRCommandCenter";


function guard(element: React.ReactElement) {
  return <RequireAuth>{element}</RequireAuth>;
}

/**
 * RepoRoutes — renders the /repos/:owner/:repo nested route tree.
 * Consumed by App.tsx inside a <Routes> block.
 *
 * CRITICAL (React Router v6): All child <Route path="..."> values here are
 * RELATIVE segments. They are automatically resolved against the parent
 * path="/repos/:owner/:repo". Do NOT add "repos/:owner/:repo/" prefix.
 */
export function RepoRoutes() {
  return (
    <Route path="/repos/:owner/:repo" element={guard(<RepoLayout />)}>

      {/* Default: redirect index to dashboard */}
      <Route index element={<Navigate to="dashboard" replace />} />

      {/* ── Core repo pages ────────────────────────────────────────── */}
      <Route path="dashboard" element={<RepoStats />} />
      <Route path="stats" element={<RepoStats />} />
      <Route path="explorer" element={<RepoExplorer />} />

      {/* ── REPO-SPECIFIC PLANNING & PROJECTS ──────────────────────────
          Scope: strictly scoped to the active workspace repo.
          API calls: /api/repos/:owner/:repo/projects, /api/repos/:owner/:repo/tasks, etc.
          Context: RepoLayout injects { owner, repo } into all children.
      ──────────────────────────────────────────────────────────────── */}

      {/* /repos/:owner/:repo/plan — repo-specific planning hub */}
      <Route path="plan" element={<RepoPlan />} />

      {/* /repos/:owner/:repo/projects — repo project board */}
      <Route path="projects" element={<Projects />} />
      <Route path="projects/:projectId" element={guard(<ProjectView />)} />

      {/* Work items within a project */}
      <Route path="projects/tasks" element={guard(<Projects />)} />
      <Route path="projects/:projectId/tasks" element={guard(<Projects />)} />
      <Route path="projects/:projectId/tasks/:taskId" element={guard(<TaskDetails />)} />

      <Route path="projects/epics" element={guard(<Projects />)} />
      <Route path="projects/:projectId/epics" element={guard(<Projects />)} />
      <Route path="projects/:projectId/epics/:epicId" element={guard(<TaskDetails />)} />

      <Route path="projects/stories" element={guard(<Projects />)} />
      <Route path="projects/:projectId/stories" element={guard(<Projects />)} />
      <Route path="projects/:projectId/stories/:storyId" element={guard(<TaskDetails />)} />

      <Route path="projects/phases" element={guard(<Projects />)} />
      <Route path="projects/:projectId/phases" element={guard(<Projects />)} />
      <Route path="projects/:projectId/phases/:phaseId" element={guard(<TaskDetails />)} />

      <Route path="projects/sprints" element={guard(<Projects />)} />
      <Route path="projects/:projectId/sprints" element={guard(<Projects />)} />
      <Route path="projects/:projectId/sprints/:sprintId" element={guard(<TaskDetails />)} />

      {/* Repo project views */}
      <Route path="projects/kanban" element={<Kanban />} />
      <Route path="projects/kanban/:projectId" element={guard(<ProjectView />)} />
      <Route path="projects/roadmap" element={<Roadmap />} />
      <Route path="projects/roadmap/:projectId" element={guard(<ProjectView />)} />
      <Route path="projects/icebox" element={<Todo />} />
      <Route path="projects/icebox/:projectId" element={guard(<ProjectView />)} />

      {/* ── Execution: PRs ────────────────────────────────────────── */}
      <Route path="prs" element={<RepoPRs />} />
      {/* Specific routes BEFORE parameterised catch-alls */}
      <Route path="pr-command/:prNumber/cloudflare-docs" element={<RepoCloudfareDocs source="pr" />} />
      <Route path="pr-center" element={<PRCommandCenter />} />

      {/* ── SDKs & specialized tooling ────────────────────────────── */}
      <Route path="cloudflaresdk" element={<RepoCloudflareSDK />} />
      <Route path="vibesdk" element={<RepoVibeSDK />} />
      <Route path="ux-workshop" element={<RepoUxWorkshop />} />
      <Route path="component-identifier" element={<RepoComponentIdentifier />} />

      {/* ── Reverse engineering (repo-scoped) ─────────────────────── */}
      <Route path="reverse-engineering" element={guard(<ReverseEngineering />)} />
      <Route path="reverse-engineering/:snapshotId" element={guard(<ReverseEngineeringSnapshot />)} />

      {/* ── Repo Utilities ───────────────────────────────────────── */}
      {/* cloudflare-docs BEFORE :tool_name to prevent shadowing */}
      <Route path="tools/cloudflare-docs" element={<RepoCloudfareDocs source="project-tools" />} />
      <Route path="tools/cloudflare-chat" element={guard(<CloudflareChat />)} />
      <Route path="tools/docs/cloudflare-agent" element={<CloudflareDocsInfo />} />
      <Route path="tools/:tool_name" element={<RepoTools />} />
      <Route path="tools" element={<RepoTools />} />
      <Route path="chat" element={<Chat />} />

      {/* ── Repo Workshop / Agent studio ──────────────────────────── */}
      <Route path="workshop" element={guard(<AgentWorkshop />)} />
      <Route path="workshop/command-center" element={guard(<GlobalCommandCenter />)} />
      <Route path="workshop/takeover" element={guard(<WorkshopTakeover />)} />

      {/* ── Repo scope catch-all → redirect to dashboard ─────────── */}
      <Route path="*" element={<Navigate to="dashboard" replace />} />

    </Route>
  );
}
