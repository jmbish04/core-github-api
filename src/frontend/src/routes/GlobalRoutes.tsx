/**
 * GlobalRoutes.tsx
 * ─────────────────────────────────────────────────────────────────
 * SCOPE: GLOBAL — routes that have cross-repository purview.
 *        These views are NOT scoped to a specific owner/repo.
 *        API calls inside these views must target /api/* or /api/global/* endpoints.
 *
 * RULE: Every route in this file must be absolutely rooted (starts with "/").
 *       Never place repo-specific (:owner/:repo) views here.
 *       For repo-scoped views, see @/routes/RepoRoutes.tsx.
 * ─────────────────────────────────────────────────────────────────
 */

import { Route, Navigate } from "react-router-dom";
import React from "react";
import { RequireAuth } from "@/components/RequireAuth";

// Layouts
import RootLayout from "@/layouts/RootLayout";

// Public views
import Home from "@/views/public/Home";
import Docs from "@/views/public/Docs";
import Health from "@/views/public/Health";
import Sitemap from "@/views/public/Sitemap";
import SparkLanding from "@/views/public/SparkLanding";
import CloudflareDocsInfo from "@/views/public/CloudflareDocsInfo";
import WorkflowEditor from "@/views/public/WorkflowEditor";
import WorkflowNew from "@/views/public/WorkflowNew";

// Auth views
import Login from "@/views/public/Login";
import AuthCallback from "@/views/public/AuthCallback";

// Core global control views
import Chat from "@/views/control/global/Chat";
import Dashboard from "@/views/control/global/Dashboard";
import Settings from "@/views/control/global/Settings";
import { CloudflareCosts } from "@/views/control/global/CloudflareCosts";
import ToolsPage from "@/views/control/global/Tools";
import Alerts from "@/views/control/global/Alerts";
import Webhooks from "@/views/control/global/Webhooks";
import CommentsViewer from "@/views/control/global/CommentsViewer";
import Standardization from "@/views/control/global/Standardization";
import AppStore from "@/views/control/global/AppStore";
import CloudflareChat from "@/views/control/global/CloudflareChat";
import Workflows from "@/views/control/global/Workflows";
import { PRCommandCenter } from "@/views/control/global/PRCommandCenter";

// Global planning & project management views
// These have cross-repo purview — they call /api/projects, /api/tasks, etc.
import Projects from "@/views/control/global/Projects";  // /projects list + project board
import ProjectView from "@/views/repos/Overview";         // /projects/:projectId detail view
import Kanban from "@/views/control/global/Kanban";       // /projects/kanban
import Roadmap from "@/views/control/global/Roadmap";     // /projects/roadmap
import Todo from "@/views/control/global/Todo";           // /projects/icebox + /todos
import TaskDetails from "@/views/control/global/TaskDetails"; // task/epic/story detail overlay

// Global planning (cross-repo project planning)
import ProjectPlanPage from "@/views/repos/Plan"; // reused; global plan has broader scope

// Reverse engineering (global — no repo lock)
import ReverseEngineering from "@/views/control/global/ReverseEngineering";
import ReverseEngineeringSnapshot from "@/views/control/global/ReverseEngineeringSnapshot";

// Beta Tracker (global)
import { TrackerBeta } from "@/views/control/global/TrackerBeta";

// Workshop / Agent agentic module (global)
import AgentWorkshop from "@/views/control/global/AgentWorkshop";
import { GlobalCommandCenter } from "@/components/workshop/GlobalCommandCenter";
import { WorkshopTakeover } from "@/components/workshop/WorkshopTakeover";

// Research module
import DeepResearchChatPage from "@/views/research/DeepResearchChatPage";
import CustomJobsPage from "@/views/research/CustomJobsPage";
import DailyTrendsPage from "@/views/research/DailyTrendsPage";
import ConfigureCronPage from "@/views/research/ConfigureCronPage";
import ProjectEditorWrapper from "@/views/research/ProjectEditorWrapper";
import ReportViewer from "@/views/research/ReportViewer";

// Repository list (global — /repos is the repo picker, NOT a repo-scoped route)
import ReposList from "@/views/control/global/Projects"; // uses Projects.tsx which renders repo cards

function guard(element: React.ReactElement) {
  return <RequireAuth>{element}</RequireAuth>;
}

/**
 * GlobalRoutes — renders inside <Routes> in App.tsx.
 *
 * Structural note: auth and layout-less routes are top-level siblings.
 * All authenticated global views are nested under <RootLayout />.
 */
export function GlobalRoutes() {
  return (
    <>
      {/* ── Public / Auth (no layout) ──────────────────────────────── */}
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* ── All global views wrapped in RootLayout ─────────────────── */}
      <Route element={<RootLayout />}>

        {/* ── Public utility routes ─────────────────────────────────── */}
        <Route path="/" element={<Home />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/sitemap" element={<Sitemap />} />
        <Route path="/health" element={guard(<Health />)} />
        <Route path="/costs" element={guard(<CloudflareCosts />)} />
        <Route path="/spark" element={<SparkLanding />} />

        {/* ── Tools (global tool catalogue) ───────────────────────── */}
        <Route path="/tools/:tool_name?" element={guard(<ToolsPage />)} />

        {/* ── Settings ─────────────────────────────────────────────── */}
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/settings/:tab" element={guard(<Settings />)} />

        {/* ── Dashboard ────────────────────────────────────────────── */}
        <Route path="/dashboard" element={guard(<Dashboard />)} />

        {/* ── GLOBAL PLANNING & PROJECTS ───────────────────────────────
            Scope: cross-repo purview. Calls /api/projects, /api/tasks, etc.
            Distinguished from /repos/:owner/:repo/plan (repo-specific).
        ─────────────────────────────────────────────────────────── */}

        {/* /plan — global planning hub */}
        <Route path="/plan" element={guard(<ProjectPlanPage />)} />

        {/* /projects — global project board (Asana/Linear style) */}
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={guard(<ProjectView />)} />

        {/* /projects — work items (TODO: replace with dedicated global views) */}
        <Route path="/projects/tasks" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/tasks" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/tasks/:taskId" element={guard(<TaskDetails />)} />

        <Route path="/projects/epics" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/epics" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/epics/:epicId" element={guard(<TaskDetails />)} />

        <Route path="/projects/stories" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/stories" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/stories/:storyId" element={guard(<TaskDetails />)} />

        <Route path="/projects/phases" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/phases" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/phases/:phaseId" element={guard(<TaskDetails />)} />

        <Route path="/projects/sprints" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/sprints" element={guard(<Projects />)} />
        <Route path="/projects/:projectId/sprints/:sprintId" element={guard(<TaskDetails />)} />

        {/* /projects — views */}
        <Route path="/projects/kanban" element={<Kanban />} />
        <Route path="/projects/kanban/:projectId" element={guard(<ProjectView />)} />
        <Route path="/projects/roadmap" element={<Roadmap />} />
        <Route path="/projects/roadmap/:projectId" element={guard(<ProjectView />)} />
        <Route path="/projects/icebox" element={<Todo />} />
        <Route path="/projects/icebox/:projectId" element={guard(<ProjectView />)} />

        {/* ── Repository list (global picker, not scoped to a repo) ── */}
        <Route path="/repos" element={guard(<ReposList />)} />

        {/* ── Workflows ────────────────────────────────────────────── */}
        <Route path="/workflows" element={guard(<Workflows />)} />
        <Route path="/workflows/new" element={guard(<WorkflowNew />)} />
        <Route path="/workflows/:workflowId" element={guard(<WorkflowEditor />)} />

        {/* ── Research module ──────────────────────────────────────── */}
        <Route path="/research" element={<Navigate to="/research/custom" replace />} />
        <Route path="/research/chat" element={guard(<DeepResearchChatPage />)} />
        <Route path="/research/custom" element={guard(<CustomJobsPage />)} />
        <Route path="/research/custom/:id" element={guard(<ProjectEditorWrapper type="custom" />)} />
        <Route path="/research/daily-trends" element={guard(<DailyTrendsPage />)} />
        <Route path="/research/configure-cron" element={guard(<ConfigureCronPage />)} />
        <Route path="/research/configure-cron/:id" element={guard(<ProjectEditorWrapper type="cron" />)} />
        <Route path="/research/report/:id" element={guard(<ReportViewer />)} />

        {/* ── Cloudflare module (global AI docs agent) ─────────────── */}
        <Route path="/cloudflare-chat" element={guard(<CloudflareChat />)} />
        <Route path="/docs/cloudflare-agent" element={<CloudflareDocsInfo />} />

        {/* ── Traditional global utility views ─────────────────────── */}
        <Route path="/reverse-engineering" element={guard(<ReverseEngineering />)} />
        <Route path="/reverse-engineering/:snapshotId" element={guard(<ReverseEngineeringSnapshot />)} />
        <Route path="/kanban" element={guard(<Kanban />)} />
        <Route path="/roadmap" element={guard(<Roadmap />)} />
        <Route path="/pr-center" element={guard(<PRCommandCenter />)} />
        <Route path="/chat" element={guard(<Chat />)} />
        <Route path="/view-comments/:id" element={guard(<CommentsViewer />)} />
        <Route path="/view-comments/:owner/:repo/pull/:number" element={<CommentsViewer />} />
        <Route path="/webhooks" element={guard(<Webhooks />)} />
        <Route path="/todos" element={guard(<Todo />)} />
        <Route path="/standardization" element={guard(<Standardization />)} />
        <Route path="/apps" element={guard(<AppStore />)} />
        <Route path="/alerts" element={guard(<Alerts />)} />

        {/* ── Beta Tracker (global) ──────────────────────────────── */}
        <Route path="/beta/tracker" element={guard(<TrackerBeta />)} />
        <Route path="/beta/tracker/:view" element={guard(<TrackerBeta />)} />

        {/* ── Workshop / Agent studio (global) ─────────────────────── */}
        <Route path="/workshop" element={guard(<AgentWorkshop />)} />
        <Route path="/workshop/command-center" element={guard(<GlobalCommandCenter />)} />
        <Route path="/workshop/takeover" element={guard(<WorkshopTakeover />)} />

        {/* ── Legacy redirect ──────────────────────────────────────── */}
        <Route path="/control-center" element={guard(<Navigate to="/dashboard" replace />)} />

        {/* ── Root catch-all ────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </>
  );
}
