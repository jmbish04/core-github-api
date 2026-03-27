/**
 * App.tsx — Application Entry Point
 * ─────────────────────────────────────────────────────────────────
 * This file is intentionally minimal. Routing is split by scope:
 *
 *   Global scope  → @/routes/GlobalRoutes.tsx
 *   Repo scope    → @/routes/RepoRoutes.tsx
 *
 * See .agent/rules/01-routing-and-scope.md for the full dual-scope
 * paradigm and rules for adding new routes.
 * ─────────────────────────────────────────────────────────────────
 */

import { BrowserRouter, Routes, Navigate, Route, useParams } from "react-router-dom";
import { AuthProvider } from "@/context/auth-context";
import { AlertsProvider } from "@/context/alerts-context";
import { JulesLiveProvider } from "@/context/jules-live-context";
import { Toaster } from "sonner";

import { GlobalRoutes } from "@/routes/GlobalRoutes";
import { RepoRoutes } from "@/routes/RepoRoutes";

/**
 * Legacy redirect: /project/:owner/:repo/* → /repos/:owner/:repo/*
 * Preserves old bookmarks without breaking the canonical URL structure.
 */
function RedirectToRepoPath() {
  const { owner, repo, "*": rest } = useParams<{ owner: string; repo: string; "*": string }>();
  const suffix = rest ? `/${rest}` : "";
  return <Navigate to={`/repos/${owner}/${repo}${suffix}`} replace />;
}

function App() {
  return (
    <AuthProvider>
      <AlertsProvider>
        <JulesLiveProvider>
          <BrowserRouter>
            <Routes>
              {/* ── Global (cross-repo) routes ─────────────────────────── */}
              {GlobalRoutes()}

              {/* ── Active Workspace (repo-scoped) routes ──────────────── */}
              {RepoRoutes()}

              {/* ── Legacy redirects ────────────────────────────────────── */}
              {/* /project/:owner/:repo/* → /repos/:owner/:repo/* */}
              <Route path="/project/:owner/:repo/*" element={<RedirectToRepoPath />} />
            </Routes>
          </BrowserRouter>
          <Toaster richColors closeButton position="bottom-right" theme="dark" />
        </JulesLiveProvider>
      </AlertsProvider>
    </AuthProvider>
  );
}

export default App;
