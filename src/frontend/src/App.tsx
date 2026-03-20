import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import React from "react";
import RootLayout from "@/layouts/RootLayout";
import Home from "@/views/public/Home";
import Chat from "@/views/control/global/Chat";
import Docs from "@/views/public/Docs";
import Health from "@/views/public/Health";
import CommentsViewer from "@/views/control/global/CommentsViewer";
import Workflows from "@/views/control/global/Workflows";
import WorkflowEditor from "@/views/public/WorkflowEditor";
import WorkflowNew from "@/views/public/WorkflowNew";
import SparkLanding from "@/views/public/SparkLanding";
import CustomJobsPage from "@/views/research/CustomJobsPage";
import DeepResearchChatPage from "@/views/research/DeepResearchChatPage";
import DailyTrendsPage from "@/views/research/DailyTrendsPage";
import ConfigureCronPage from "@/views/research/ConfigureCronPage";
import ProjectEditorWrapper from "@/views/research/ProjectEditorWrapper";
import ReportViewer from "@/views/research/ReportViewer";
import ToolsPage from "@/views/control/global/Tools";
import CloudflareChat from "@/views/control/global/CloudflareChat";
import CloudflareDocsInfo from "@/views/public/CloudflareDocsInfo";
import Standardization from "@/views/control/global/Standardization";
import AppStore from "@/views/control/global/AppStore";
import AgentWorkshop from "@/views/control/global/AgentWorkshop";
import { CloudflareCosts } from "@/views/control/global/CloudflareCosts";

// New Phase 3 components
import { GlobalCommandCenter } from "@/components/workshop/GlobalCommandCenter";
import { WorkshopTakeover } from "@/components/workshop/WorkshopTakeover";

import { PRCommandCenter } from "@/views/control/global/PRCommandCenter";
import Dashboard from "@/views/control/global/Dashboard";
import ReverseEngineering from "@/views/control/global/ReverseEngineering";
import ReverseEngineeringSnapshot from "@/views/control/global/ReverseEngineeringSnapshot";
import Kanban from "@/views/control/global/Kanban";
import Roadmap from "@/views/control/global/Roadmap";
import Projects from "@/views/control/global/Projects";
import ProjectView from "@/views/control/global/ProjectView";
import ProjectDashboard from "@/views/control/global/ProjectDashboard";
import SettingsPage from "@/views/control/global/Settings";
import TaskDetails from "@/views/control/global/TaskDetails";
import Webhooks from "@/views/control/global/Webhooks";
import Todo from "@/views/control/global/Todo";
import Login from "@/views/public/Login";
import AuthCallback from "@/views/public/AuthCallback";
import Sitemap from "@/views/public/Sitemap";
import { AuthProvider } from "@/context/auth-context";
import { RequireAuth } from "@/components/RequireAuth";
import ProjectCloudflareDocsPage from "@/views/control/global/ProjectCloudflareDocsPage";
import AlertsPage from "@/views/control/global/Alerts";
import { AlertsProvider } from "@/context/alerts-context";
import { JulesLiveProvider } from "@/context/jules-live-context";
import { Toaster } from "sonner";

function guard(element: React.ReactElement) {
  return <RequireAuth>{element}</RequireAuth>;
}

function App() {
  return (
    <AuthProvider>
      <AlertsProvider>
      <JulesLiveProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<RootLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/sitemap" element={<Sitemap />} />
            <Route path="/health" element={guard(<Health />)} />
            <Route path="/costs" element={guard(<CloudflareCosts />)} />
            {/* Global Tools Route with Optional Tab Parameter */}
            <Route path="/tools/:tool_name?" element={guard(<ToolsPage />)} />
            <Route path="/settings" element={<Navigate to="/settings/general" replace />} />

            <Route path="/workflows" element={guard(<Workflows />)} />
            <Route path="/workflows/new" element={<WorkflowNew />} />
            <Route path="/workflows/:workflowId" element={<WorkflowEditor />} />
            <Route path="/spark" element={<SparkLanding />} />
            
            {/* Individual Deep Research Routes */}
            <Route path="/research" element={<Navigate to="/research/custom" replace />} />
            <Route path="/research/chat" element={guard(<DeepResearchChatPage />)} />
            <Route path="/research/custom" element={guard(<CustomJobsPage />)} />
            <Route path="/research/custom/:id" element={guard(<ProjectEditorWrapper type="custom" />)} />
            <Route path="/research/daily-trends" element={guard(<DailyTrendsPage />)} />
            <Route path="/research/configure-cron" element={guard(<ConfigureCronPage />)} />
            <Route path="/research/configure-cron/:id" element={guard(<ProjectEditorWrapper type="cron" />)} />
            <Route path="/research/report/:id" element={guard(<ReportViewer />)} />
            
            {/* Cloudflare Tool Routes */}
            <Route path="/cloudflare-chat" element={guard(<CloudflareChat />)} />
            <Route path="/docs/cloudflare-agent" element={<CloudflareDocsInfo />} />

            <Route path="/dashboard" element={guard(<Dashboard />)} />
            <Route path="/reverse-engineering" element={guard(<ReverseEngineering />)} />
            <Route path="/reverse-engineering/:snapshotId" element={guard(<ReverseEngineeringSnapshot />)} />
            <Route path="/projects/:username/:repo_name/reverse-engineering" element={guard(<ReverseEngineering />)} />
            <Route path="/projects/:username/:repo_name" element={guard(<ProjectDashboard />)} />
            <Route path="/projects/:username/:repo_name/:tab" element={guard(<ProjectDashboard />)} />

            <Route path="/control-center" element={guard(<Navigate to="/dashboard" replace />)} />
            <Route path="/projects" element={<Navigate to="/repos" replace />} />
            <Route path="/projects/:projectId" element={guard(<ProjectView />)} />
            <Route path="/repos" element={guard(<Projects />)} />
            {/* Two-segment repo routes must come BEFORE the single-segment :projectId catch-all */}
            <Route path="/repos/:username/:repo_name" element={guard(<ProjectDashboard />)} />
            <Route path="/repos/:username/:repo_name/:tab" element={guard(<ProjectDashboard />)} />
            <Route path="/repos/:projectId" element={guard(<ProjectView />)} />
            <Route path="/task/:taskId" element={guard(<TaskDetails />)} />
            <Route path="/chat" element={guard(<Chat />)} />
            {/* Duplicate workflows route removed */}
            <Route path="/workflows/new" element={guard(<WorkflowNew />)} />
            <Route path="/workflows/:workflowId" element={guard(<WorkflowEditor />)} />
            <Route path="/view-comments/:id" element={guard(<CommentsViewer />)} />
            <Route path="/view-comments/:owner/:repo/pull/:number" element={<CommentsViewer />} />
            <Route path="/pr-center" element={guard(<PRCommandCenter />)} />
            <Route path="/kanban" element={guard(<Kanban />)} />
            <Route path="/roadmap" element={guard(<Roadmap />)} />
            <Route path="/webhooks" element={guard(<Webhooks />)} />
            <Route path="/todos" element={guard(<Todo />)} />
            <Route path="/settings" element={guard(<Navigate to="/settings/general" replace />)} />
            <Route path="/settings/:tab" element={guard(<SettingsPage />)} />
            <Route path="/standardization" element={guard(<Standardization />)} />
            <Route path="/apps" element={guard(<AppStore />)} />
            <Route path="/alerts" element={guard(<AlertsPage />)} />

            {/* Workshop Agentic Module */}
            <Route path="/workshop" element={guard(<AgentWorkshop />)} />
            <Route path="/workshop/command-center" element={guard(<GlobalCommandCenter />)} />
            <Route path="/workshop/takeover" element={guard(<WorkshopTakeover />)} />

            {/* Project-First Navigation Routes */}
            <Route path="/project/:owner/:repo/dashboard" element={guard(<ProjectDashboard />)} />
            <Route path="/project/:owner/:repo/kanban" element={guard(<Kanban />)} />
            <Route path="/project/:owner/:repo/chat" element={guard(<Chat />)} />
            <Route path="/project/:owner/:repo/roadmap" element={guard(<Roadmap />)} />
            <Route path="/project/:owner/:repo/pr-center" element={guard(<PRCommandCenter />)} />
            <Route path="/project/:owner/:repo/reverse-engineering" element={guard(<ReverseEngineering />)} />
            <Route path="/project/:owner/:repo/settings" element={guard(<Navigate to="/settings/general" replace />)} />
            <Route path="/project/:owner/:repo/icebox" element={guard(<Todo />)} />
            <Route path="/project/:owner/:repo/tools/:tool_name?" element={guard(<ToolsPage />)} />
            {/* Project-scoped Cloudflare Docs (workspace Tools menu) */}
            <Route path="/project/:owner/:repo/tools/cloudflare-docs" element={guard(<ProjectCloudflareDocsPage source="project-tools" />)} />
            {/* PR-scoped Cloudflare Docs */}
            <Route path="/project/:owner/:repo/pr-command/:prNumber/cloudflare-docs" element={guard(<ProjectCloudflareDocsPage source="pr" />)} />
            {/* Dashboard tab catch-all (must be AFTER specific routes) */}
            <Route path="/project/:owner/:repo/:tab" element={guard(<ProjectDashboard />)} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </JulesLiveProvider>
      </AlertsProvider>
      <Toaster richColors closeButton position="bottom-right" theme="dark" />
    </AuthProvider>
  );
}

export default App;
