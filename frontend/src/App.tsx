import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import React from "react";
import RootLayout from "@/layouts/RootLayout";
import Home from "@/pages/public/Home";
import Chat from "@/pages/control/global/Chat";
import Docs from "@/pages/public/Docs";
import Health from "@/pages/public/Health";
import CommentsViewer from "@/pages/control/global/CommentsViewer";
import WorkflowsLanding from "@/pages/public/WorkflowsLanding";
import WorkflowEditor from "@/pages/public/WorkflowEditor";
import WorkflowNew from "@/pages/public/WorkflowNew";
import Research from "@/pages/Research";

import { PRCommandCenter } from "@/pages/control/global/PRCommandCenter";
import Dashboard from "@/pages/control/global/Dashboard";
import Kanban from "@/pages/control/global/Kanban";
import Roadmap from "@/pages/control/global/Roadmap";
import Projects from "@/pages/control/global/Projects";
import ProjectView from "@/pages/control/global/ProjectView";
import ProjectDashboard from "@/pages/control/global/ProjectDashboard";
import SettingsPage from "@/pages/control/global/Settings";
import TaskDetails from "@/pages/control/global/TaskDetails";
import Webhooks from "@/pages/control/global/Webhooks";
import Todo from "@/pages/control/global/Todo";
import Login from "@/pages/public/Login";
import AuthCallback from "@/pages/public/AuthCallback";
import { AuthProvider } from "@/context/auth-context";
import { RequireAuth } from "@/components/RequireAuth";

function guard(element: React.ReactElement) {
  return <RequireAuth>{element}</RequireAuth>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<RootLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/health" element={guard(<Health />)} />
            <Route path="/settings" element={guard(<SettingsPage />)} />

            <Route path="/workflows" element={<WorkflowsLanding />} />
            <Route path="/workflows/new" element={<WorkflowNew />} />
            <Route path="/workflows/:workflowId" element={<WorkflowEditor />} />
            <Route path="/research" element={<Research />} />

            <Route path="/dashboard" element={guard(<Navigate to="/control-center/dashboard" replace />)} />
            <Route path="/projects" element={guard(<Navigate to="/control-center/projects" replace />)} />
            <Route path="/projects/:username/:repo_name" element={guard(<ProjectDashboard />)} />

            <Route path="/control-center" element={guard(<Navigate to="/control-center/dashboard" replace />)} />
            <Route path="/control-center/dashboard" element={guard(<Dashboard />)} />
            <Route path="/control-center/projects" element={guard(<Projects />)} />
            <Route path="/control-center/projects/:projectId" element={guard(<ProjectView />)} />
            <Route path="/control-center/task/:taskId" element={guard(<TaskDetails />)} />
            <Route path="/control-center/chat" element={guard(<Chat />)} />
            <Route path="/control-center/workflows" element={guard(<WorkflowsLanding />)} />
            <Route path="/control-center/workflows/new" element={guard(<WorkflowNew />)} />
            <Route path="/control-center/workflows/:workflowId" element={guard(<WorkflowEditor />)} />
            <Route path="/control-center/view-comments/:id" element={guard(<CommentsViewer />)} />
            <Route path="/control-center/pr-center" element={guard(<PRCommandCenter />)} />
            <Route path="/control-center/kanban" element={guard(<Kanban />)} />
            <Route path="/control-center/roadmap" element={guard(<Roadmap />)} />
            <Route path="/control-center/webhooks" element={guard(<Webhooks />)} />
            <Route path="/control-center/todos" element={guard(<Todo />)} />
            <Route path="/control-center/settings" element={guard(<SettingsPage />)} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
