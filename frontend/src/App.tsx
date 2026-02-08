import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RootLayout from "@/layouts/RootLayout";
import Home from "@/pages/public/Home";
import Chat from "@/pages/control/global/Chat";
import Docs from "@/pages/public/Docs";
import Workflows from "@/pages/public/Workflows";
import Health from "@/pages/public/Health";
import CommentsViewer from "@/pages/control/global/CommentsViewer";

import { PRCommandCenter } from "@/pages/control/global/PRCommandCenter";
import Dashboard from "@/pages/control/global/Dashboard";
import Kanban from "@/pages/control/global/Kanban";
import Roadmap from "@/pages/control/global/Roadmap";
import Projects from "@/pages/control/global/Projects";
import TaskDetails from "@/pages/control/global/TaskDetails";
import Webhooks from "@/pages/control/global/Webhooks";
import Todo from "@/pages/control/global/Todo";
import Login from "@/pages/public/Login";
import { AuthProvider } from "@/context/AuthContext";
import { RequireAuth } from "@/components/RequireAuth";


function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout />}>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/health" element={<Health />} />
            <Route path="/login" element={<Login />} />

            {/* Protected Control Center Routes */}
            {/* Protected Control Center Routes */}
            <Route path="/control-center" element={<RequireAuth><Navigate to="/control-center/dashboard" replace /></RequireAuth>} />
            <Route path="/control-center/projects" element={<RequireAuth><Projects /></RequireAuth>} />
            <Route path="/control-center/task/:taskId" element={<RequireAuth><TaskDetails /></RequireAuth>} />
            <Route path="/control-center/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/control-center/chat" element={<RequireAuth><Chat /></RequireAuth>} />
            <Route path="/control-center/workflows" element={<RequireAuth><Workflows /></RequireAuth>} />
            <Route path="/control-center/workflows/:workflowId" element={<RequireAuth><Workflows /></RequireAuth>} />
            <Route path="/control-center/view-comments/:id" element={<RequireAuth><CommentsViewer /></RequireAuth>} />

            <Route path="/control-center/pr-center" element={<RequireAuth><PRCommandCenter /></RequireAuth>} />
            <Route path="/control-center/kanban" element={<RequireAuth><Kanban /></RequireAuth>} />
            <Route path="/control-center/roadmap" element={<RequireAuth><Roadmap /></RequireAuth>} />
            <Route path="/control-center/webhooks" element={<RequireAuth><Webhooks /></RequireAuth>} />
            <Route path="/control-center/todos" element={<RequireAuth><Todo /></RequireAuth>} />

            {/* Fallback to landing */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
