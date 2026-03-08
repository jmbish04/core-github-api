import React from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * AgentAuthError — shown when ?AGENT_AUTH is present in the URL but the value
 * is missing or clearly malformed. This avoids a confusing redirect to /login
 * when the user explicitly attempted the key-bypass flow.
 *
 * Note: an incorrect-but-well-formed key will be accepted here (set as cookie)
 * and the backend will return a 401 when the next API call is made. That 401
 * should be surfaced by the individual page's data-fetching layer.
 */
function AgentAuthError({ reason }: { reason: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md border-destructive/50">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-destructive" />
            <CardTitle className="text-xl font-bold text-destructive">
              Agent Auth Failed
            </CardTitle>
          </div>
          <CardDescription className="text-muted-foreground">
            The <code className="text-xs bg-muted px-1 py-0.5 rounded">?AGENT_AUTH</code> key
            bypass was attempted but could not authenticate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive-foreground">
            <p className="font-medium mb-1">Reason</p>
            <p className="text-muted-foreground">{reason}</p>
          </div>
          <div className="rounded-md bg-muted/40 border p-4 text-xs text-muted-foreground space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <KeyRound className="w-3.5 h-3.5" />
              Expected usage
            </p>
            <code className="block break-all">
              https://core-github-api.hacolby.workers.dev/dashboard?AGENT_AUTH=&lt;AGENTIC_WORKER_API_KEY&gt;
            </code>
            <p className="pt-1">
              The value must match the <strong>AGENTIC_WORKER_API_KEY</strong> secret
              binding in <code>wrangler.jsonc</code> — not <code>WORKER_API_KEY</code>.
            </p>
          </div>
          <a
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4 hover:opacity-80"
          >
            Go to login page instead
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * RequireAuth — wraps guarded routes. Supports three authentication paths:
 *
 * 1. Cookie (`colby_api_key`) — standard login flow.
 * 2. `?AGENT_AUTH=<key>` — agentic key bypass. If the param is present,
 *    the value is stored as a cookie and the user is authenticated in-place.
 *    An explicit error is shown if the param is present but empty.
 * 3. Redirect to /login if neither condition is met.
 *
 * KEY SEPARATION (enforced by backend):
 * - ?AGENT_AUTH → AGENTIC_WORKER_API_KEY ONLY. Never stored in session cookie.
 * - cookie / ?key / ?token → WORKER_API_KEY ONLY.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const agentAuth = searchParams.get('AGENT_AUTH');
  const agentAuthAttempted = agentAuth !== null; // param key present, even if empty

  // ── ?AGENT_AUTH bypass ────────────────────────────────────────────────────
  // When ?AGENT_AUTH is present and non-empty, render the page immediately.
  // The key is NOT stored as a cookie — the backend rejects AGENTIC_WORKER_API_KEY
  // via cookie/header auth. The key stays in the URL and is sent as ?AGENT_AUTH
  // on each API call made by the page.
  if (agentAuthAttempted) {
    if (!agentAuth) {
      // Param present but empty → explicit error
      return (
        <AgentAuthError reason="The ?AGENT_AUTH query parameter was present but empty. Provide the AGENTIC_WORKER_API_KEY value as the parameter value." />
      );
    }
    // Key present → allow render. Backend validates on each API request.
    return <>{children}</>;
  }

  // Standard unauthenticated — redirect to /login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

