import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb';

export function CIHealerDoc() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-6xl mx-auto px-4 py-8">
        
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/" className="text-zinc-400 hover:text-zinc-100 transition-colors">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-zinc-600" />
            <BreadcrumbItem>
               <BreadcrumbLink href="/docs/toolkit" className="text-zinc-400 hover:text-zinc-100 transition-colors">Documentation</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-zinc-600" />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-zinc-100 font-medium tracking-tight">CI Healer API</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-50 mb-4 font-mono">CI Healer & HITL Learning</h1>
          <p className="text-xl text-zinc-400 max-w-3xl leading-relaxed">
            The CI Healer is an autonomous Cloudflare worker system designed to monitor GitHub PR checks, extract tailored build logs, and formulate diagnostic fixes using Jules AI. With the introduction of the Human-in-the-Loop (HITL) Continuous Learning process, it serves as the frontline observability layer capable of evolving system guardrails sequentially over time.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-8">
            <Card className="bg-zinc-900 border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
              <CardHeader className="border-b border-zinc-800/50 bg-zinc-900/50">
                <CardTitle className="text-2xl text-zinc-100 font-mono tracking-tight flex items-center gap-2">
                  <span className="text-emerald-500">{"//"}</span> Core Architecture
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 prose prose-invert max-w-none">
                <h3 className="text-zinc-300 font-medium">1. Automated Invocation (Webhooks)</h3>
                <p className="text-zinc-400">
                  The initial entrypoint resides in the Hono API routes handling GitHub App Webhook deliveries. When a <code>check_run</code> failure occurs for any deployment/wrangler-related check, the webhook handler passes the repository context into the analyzer.
                </p>
                <div className="bg-zinc-950 p-4 rounded-lg my-4 font-mono text-sm border border-zinc-800">
                  <a href="https://github.com/jmbish04/core-github-api/blob/main/src/backend/src/routes/api/webhooks/index.ts" target="_blank" className="text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-zinc-700 transition-all">
                    src/backend/src/routes/api/webhooks/index.ts
                  </a>
                </div>

                <h3 className="text-zinc-300 font-medium mt-6">2. Cloudflare Log Resolution</h3>
                <p className="text-zinc-400">
                  To dynamically locate the correct raw Cloudflare implementation, the architecture employs the <code>WranglerInspectorService</code>. It fetches the <code>wrangler.toml</code> or <code>wrangler.jsonc</code> files natively from the target repository using the Octokit credentials to correctly map the <code>scriptName</code>.
                </p>
                <div className="bg-zinc-950 p-4 rounded-lg my-4 font-mono text-sm border border-zinc-800">
                  <a href="https://github.com/jmbish04/core-github-api/blob/main/src/backend/src/services/github/wrangler-inspector.ts" target="_blank" className="text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-zinc-700 transition-all">
                    src/backend/src/services/github/wrangler-inspector.ts
                  </a>
                </div>

                <h3 className="text-zinc-300 font-medium mt-6">3. Build Analysis Logic</h3>
                <p className="text-zinc-400">
                  The <code>analyzeBuildFailure</code> function orchestrates log retrieval and isolates trace errors, then interacts with Jules AI to process the extracted context.
                </p>
                <div className="bg-zinc-950 p-4 rounded-lg my-4 font-mono text-sm border border-zinc-800">
                  <a href="https://github.com/jmbish04/core-github-api/blob/main/src/backend/src/automations/pr/build-analyzer/analysis.ts" target="_blank" className="text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-zinc-700 transition-all">
                    src/backend/src/automations/pr/build-analyzer/analysis.ts
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
              <CardHeader className="border-b border-zinc-800/50 bg-zinc-900/50">
                <CardTitle className="text-2xl text-zinc-100 font-mono tracking-tight flex items-center gap-2">
                  <span className="text-purple-500">{"//"}</span> Continuous Learning (HITL) 
                </CardTitle>
                <CardDescription className="text-zinc-400 mt-2">
                  Queueing workflows and executing golden path remedies via Cloudflare Agents SDK.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 prose prose-invert max-w-none">
                <p className="text-zinc-400 mt-0">
                  To prevent the AI from establishing doom-loops or rewriting code improperly, the CI Healer utilizes a "Propose but Block" constraint system handled by the <code>ContinuousLearningAgent</code>.
                </p>
                
                <h4 className="text-zinc-300">Phase A: Workflow Pausing</h4>
                <p className="text-zinc-400">
                  Failures are translated into recommended Golden Path fixes. However, the system utilizes Cloudflare Workflows to invoke a <code>waitForApproval</code> state (typically holding execution limits for up to 7 days) rather than proceeding independently.
                </p>

                <h4 className="text-zinc-300">Phase B: Human Evaluation Dashboard</h4>
                <p className="text-zinc-400">
                  Administrators access a queue dashboard (found in <code>/learning/queue</code>) to view the generated context. They may accept the generated Jules Prompt, reject it entirely, or mutate the prompt with manual feedback to ensure high efficacy.
                </p>

                <h4 className="text-zinc-300">Phase C: Orchestration & Email Propagation</h4>
                <p className="text-zinc-400">
                  Upon HITL completion, the <code>ContinuousLearningAgent</code> dispatches the finalized prompt to a dedicated worker agent (e.g., Jules AI Workspace Session). Jules iterates on a full Implementation Plan. Once executed successfully, learning debriefs are sent outward utilizing native Cloudflare Worker Email routings.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-zinc-900/50 border-zinc-800 rounded-xl">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-widest text-zinc-500">APIs & Integrations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                  <h4 className="text-zinc-200 font-medium flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/20">Cloudflare</Badge>
                  </h4>
                  <ul className="text-sm text-zinc-400 space-y-2 mt-2">
                    <li>• Cloudflare Workers Deployment API (Fetching Meta)</li>
                    <li>• Cloudflare Tails API (Pulling error traces)</li>
                    <li>• Cloudflare Agents SDK (Managing HITL memory + state)</li>
                    <li>• Cloudflare Webhooks & Email Worker Binding</li>
                  </ul>
                </div>

                <div className="p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                  <h4 className="text-zinc-200 font-medium flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">GitHub</Badge>
                  </h4>
                  <ul className="text-sm text-zinc-400 space-y-2 mt-2">
                    <li>• Octokit <code>rest.repos.getContent</code> (Configs)</li>
                    <li>• <code>check_run</code> events</li>
                    <li>• <code>issues.createComment</code> (Fix Prompts)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-900/50 border-zinc-800 rounded-xl">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-widest text-zinc-500">Backend References</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <a href="https://github.com/jmbish04/core-github-api/tree/main/src/backend/src/automations/pr/build-analyzer" target="_blank" className="block p-3 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 transition-colors text-sm font-mono text-zinc-300">
                  /automations/pr/build-analyzer
                </a>
                <a href="https://github.com/jmbish04/core-github-api/tree/main/src/backend/src/ai/agents/ContinuousLearningAgent" target="_blank" className="block p-3 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 transition-colors text-sm font-mono text-zinc-300">
                  /ai/agents/ContinuousLearningAgent/
                </a>
                <a href="https://github.com/jmbish04/core-github-api/tree/main/src/backend/src/workflows/ContinuousLearningWorkflow.ts" target="_blank" className="block p-3 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 transition-colors text-sm font-mono text-zinc-300">
                  /workflows/ContinuousLearningWorkflow.ts
                </a>
              </CardContent>
            </Card>
          </div>
          
        </div>
      </div>
    </div>
  );
}
