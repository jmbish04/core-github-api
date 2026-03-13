import { useSearchParams } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Terminal, Cpu, Shield, Zap, GitPullRequest, Box, Code } from "lucide-react";

export default function DocsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get("tab") || "architecture";
    const handleTabChange = (val: string) => setSearchParams({ tab: val }, { replace: true });

    return (
        <div className="container mx-auto py-10 max-w-6xl space-y-8">
            <div className="space-y-4">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
                    Colby System Documentation
                </h1>
                <p className="text-xl text-muted-foreground">
                    The manual for your autonomous DevOps agent. Learn how to control the brain, the muscle, and the nervous system.
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-8">
                <TabsList className="grid w-full grid-cols-1 md:grid-cols-6 h-auto p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger value="architecture" className="py-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Architecture</TabsTrigger>
                    <TabsTrigger value="commands" className="py-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Slash Commands</TabsTrigger>
                    <TabsTrigger value="workflows" className="py-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Workflows</TabsTrigger>
                    <TabsTrigger value="jules" className="py-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Jules API</TabsTrigger>
                    <TabsTrigger value="configuration" className="py-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Configuration</TabsTrigger>
                    <TabsTrigger value="reverse-engineering" className="py-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Reverse Engineering</TabsTrigger>
                </TabsList>

                {/* --- ARCHITECTURE TAB --- */}
                <TabsContent value="architecture" className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5 text-indigo-500" /> The Brain (Worker)</CardTitle>
                                <CardDescription>Cloudflare Worker (Hono + Octokit)</CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground space-y-2">
                                <p>The central orchestrator. It receives webhooks, routes events, and uses <strong>Gemini 1.5 Pro</strong> for high-level reasoning.</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li><strong>RepositoryAnalyzer:</strong> Scans repos for stack detection ("The Roadtrip").</li>
                                    <li><strong>SlashCommandRouter:</strong> Parses user intents from comments.</li>
                                    <li><strong>Drizzle ORM:</strong> Manages state in D1 (logs, tasks, health).</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Box className="h-5 w-5 text-emerald-500" /> The Muscle (Container)</CardTitle>
                                <CardDescription>Cloudflare Container (Node.js + Git)</CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground space-y-2">
                                <p>The heavy lifter. An ephemeral Linux environment for tasks that require a filesystem.</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li><strong>Tools:</strong> <code>git</code>, <code>npm</code>, <code>gemini-cli</code>.</li>
                                    <li><strong>Mode A (API):</strong> Accepts JSON tasks via HTTP POST.</li>
                                    <li><strong>Mode B (Interactive):</strong> Streams a PTY via WebSocket for the Live Ops Console.</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-amber-500" /> The Supervisor</CardTitle>
                                <CardDescription>Durable Object (Stateful)</CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground space-y-2">
                                <p>The watchdog. A stateful agent that monitors long-running container tasks.</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li><strong>Heartbeat:</strong> Wakes up every 60s to check container health.</li>
                                    <li><strong>Logic:</strong> Uses <strong>GPT-OSS-120B</strong> (cheap model) to detect stuck processes.</li>
                                    <li><strong>Intervention:</strong> Can kill/retry processes without waking the main Brain.</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-purple-500" /> The Gateway</CardTitle>
                                <CardDescription>GitHub App Webhooks</CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground space-y-2">
                                <p>The entry point for all automation.</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li><strong>Events:</strong> <code>pull_request</code>, <code>issue_comment</code>, <code>push</code>, <code>repository.created</code>.</li>
                                    <li><strong>Security:</strong> Verifies <code>X-Hub-Signature-256</code> using your <code>WORKER_API_KEY</code>.</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* --- COMMANDS TAB --- */}
                <TabsContent value="commands" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>ChatOps Commands</CardTitle>
                            <CardDescription>Use these in PR comments or Issue bodies to trigger agents.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[200px]">Command</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="w-[100px]">Agent</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell className="font-mono text-indigo-400">/colby fix all</TableCell>
                                        <TableCell>Spins up the Container to apply <code>gemini-cli</code> fixes to all files referenced in review comments.</TableCell>
                                        <TableCell><Badge>Muscle</Badge></TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-mono text-indigo-400">/colby standardize</TableCell>
                                        <TableCell>Runs the "Roadtrip" analysis. Upgrades <code>wrangler.toml</code> to <code>jsonc</code>, adds <code>openapi.json</code>, and fixes scripts.</TableCell>
                                        <TableCell><Badge variant="outline">Brain</Badge></TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-mono text-indigo-400">/colby resolve conflicts</TableCell>
                                        <TableCell>Checks out the branch, merges main, and uses AI to resolve git conflicts.</TableCell>
                                        <TableCell><Badge>Muscle</Badge></TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-mono text-indigo-400">/colby implement</TableCell>
                                        <TableCell>Scaffolds code based on the Issue description. Creates a new branch and PR.</TableCell>
                                        <TableCell><Badge variant="outline">Brain</Badge></TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-mono text-indigo-400">/colby fix types</TableCell>
                                        <TableCell>Scans for <code>@cloudflare/workers-types</code> imports and refactors to use <code>Env</code> interface.</TableCell>
                                        <TableCell><Badge variant="outline">Brain</Badge></TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-mono text-indigo-400">/colby extract</TableCell>
                                        <TableCell>Manually triggers the comment extraction and JSON export process.</TableCell>
                                        <TableCell><Badge variant="secondary">Utility</Badge></TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- WORKFLOWS TAB --- */}
                <TabsContent value="workflows" className="space-y-6">
                    <div className="space-y-4">
                        <div className="border rounded-lg p-6 bg-card">
                            <h3 className="text-xl font-bold mb-2 flex items-center gap-2"><GitPullRequest className="text-orange-500" /> The "Roadtrip" (Repo Init)</h3>
                            <p className="text-muted-foreground mb-4">Triggered on <code>repository.created</code> or <code>/colby standardize</code>.</p>
                            <ol className="space-y-2 list-decimal list-inside text-sm">
                                <li><strong>Fingerprint:</strong> Detects stack (Hono, Next.js, Python) and bindings (D1, KV).</li>
                                <li><strong>Gap Analysis:</strong> Compares against "Gold Standard" rules (e.g., "Must have <code>AGENTS.md</code>").</li>
                                <li><strong>Remediation:</strong> Creates a new branch <code>colby/standardize-[ts]</code>.</li>
                                <li><strong>Execution:</strong> Applies fixes (e.g., generating <code>llms.txt</code> from Cloudflare Docs RAG).</li>
                                <li><strong>PR:</strong> Opens a single consolidated PR for the human to review.</li>
                            </ol>
                        </div>

                        <div className="border rounded-lg p-6 bg-card">
                            <h3 className="text-xl font-bold mb-2 flex items-center gap-2"><Terminal className="text-green-500" /> The "Heavy Lifter" (Code Fixes)</h3>
                            <p className="text-muted-foreground mb-4">Triggered by <code>/colby fix all</code>.</p>
                            <ol className="space-y-2 list-decimal list-inside text-sm">
                                <li><strong>Orchestration:</strong> Worker leases a Cloudflare Container instance.</li>
                                <li><strong>Auth:</strong> Generates a short-lived GitHub Installation Token.</li>
                                <li><strong>Execution:</strong> Container clones repo, runs <code>gemini fix</code>, and pushes commit.</li>
                                <li><strong>Supervision:</strong> Supervisor Agent monitors logs for stuck processes.</li>
                                <li><strong>Verification:</strong> Worker waits for CI to pass, then comments "✅ Fixed".</li>
                            </ol>
                        </div>
                    </div>
                </TabsContent>

                {/* --- JULES TAB --- */}
                <TabsContent value="jules" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Code className="h-5 w-5 text-amber-500" /> Jules Integration</CardTitle>
                            <CardDescription>How the frontend interacts with the Google Jules codebase orchestrator.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Jules is deeply integrated into the backend API using the <code>@google/jules-sdk</code> to handle automated code scaffolding, reviews, and architecture planning.
                            </p>
                            
                            <h3 className="text-lg font-semibold mt-6">Core Flow</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
                                <li><strong>Invocation:</strong> Triggers `/api/agents/jules/start` with a prompt and repository.</li>
                                <li><strong>Standards Injection:</strong> Global project architecture standards are prepended to ensure the PR aligns with team conventions.</li>
                                <li><strong>State Storage:</strong> Sessions are stored in D1 <code>jules_sessions</code> and <code>jules_jobs</code>.</li>
                                <li><strong>Overseer Sync:</strong> (Optional) Triggers the stateful Overseer durable object to check background job statuses.</li>
                            </ol>
                            
                            <h3 className="text-lg font-semibold mt-6">Database Entities</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                                <li><strong>julesSessions:</strong> Bound directly 1:1 with the Jules SDK session handle.</li>
                                <li><strong>julesJobs:</strong> Internal wrapper identifying repo contexts and status workflows independent of the SDK's execution.</li>
                            </ul>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- CONFIG TAB --- */}
                <TabsContent value="configuration" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Environment Variables</CardTitle>
                            <CardDescription>Required secrets in <code>wrangler.jsonc</code> or Cloudflare Dashboard.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                                <pre className="text-sm font-mono">
                                    {`# App Identity
APP_ID="123456"
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY... (Multi-line)"
WORKER_API_KEY="... (Webhook Secret)"

# Infrastructure
DB="D1 Database Binding (WEBHOOKS)"
COLBY_OPS="Container Binding"
SANDBOX="Durable Object Binding"

# AI
GEMINI_API_KEY="... (For the Brain)"
OPENAI_API_KEY="... (Optional, for fallbacks)"`}
                                </pre>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="reverse-engineering" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><GitPullRequest className="h-5 w-5 text-cyan-400" /> Reverse Engineering Toolkit</CardTitle>
                            <CardDescription>Repository analysis into PRD, epics, user journeys, UX evidence, and backend architecture.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5 text-sm text-muted-foreground">
                            <p>
                                The reverse-engineering pipeline uses a staged Honi + Jules workflow:
                                repository research, preview URL resolution, authenticated Browser Rendering screenshots,
                                parallel Jules analysis, and final synthesis into implementation-ready deliverables.
                            </p>
                            <p>
                                Screenshot capture uses the Browser Rendering REST API, not the Worker binding, so auth
                                can be injected with cookies, basic auth, or custom headers when the frontend requires it.
                            </p>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-lg border border-border/60 bg-card/40 p-4">
                                    <h3 className="mb-2 font-semibold text-foreground">API Surface</h3>
                                    <ul className="list-disc pl-5 space-y-1">
                                        <li><strong>Analyze route:</strong> <code>POST /api/reverse-engineering/analyze</code></li>
                                        <li><strong>List snapshots:</strong> <code>GET /api/reverse-engineering/snapshots</code></li>
                                        <li><strong>Snapshot detail:</strong> <code>GET /api/reverse-engineering/snapshots/:id</code></li>
                                        <li><strong>Snapshot events:</strong> <code>GET /api/reverse-engineering/snapshots/:id/events</code></li>
                                        <li><strong>Live monitor:</strong> <code>GET /api/reverse-engineering/snapshots/:id/ws</code></li>
                                        <li><strong>Resume auth:</strong> <code>POST /api/reverse-engineering/snapshots/:id/resume</code></li>
                                        <li><strong>Consultant chat:</strong> <code>POST /api/reverse-engineering/snapshots/:id/consult</code></li>
                                        <li><strong>PRD render:</strong> <code>GET /api/reverse-engineering/snapshots/:id/plan</code></li>
                                        <li><strong>Raw markdown:</strong> <code>GET /api/reverse-engineering/snapshots/:id/plan.md</code></li>
                                        <li><strong>Download markdown:</strong> <code>GET /api/reverse-engineering/snapshots/:id/download</code></li>
                                    </ul>
                                </div>
                                <div className="rounded-lg border border-border/60 bg-card/40 p-4">
                                    <h3 className="mb-2 font-semibold text-foreground">Durable Agents</h3>
                                    <ul className="list-disc pl-5 space-y-1">
                                        <li><strong>HoniOrchestrator</strong>: runs the three-stage repo research, Jules parallelization, and final synthesis loop.</li>
                                        <li><strong>HoniConsultant</strong>: answers snapshot questions using stored D1 context plus Cloudflare docs MCP when infrastructure context is relevant.</li>
                                        <li><strong>ReverseEngineeringMonitor</strong>: request-scoped WebSocket room for progress updates and event fan-out.</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-card/40 p-4">
                                <h3 className="mb-2 font-semibold text-foreground">Persistence Model</h3>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><code>reverse_eng_snapshots</code>: request metadata, preview resolution, repo research, PRD markdown, epics, journeys, and lifecycle state.</li>
                                    <li><code>reverse_eng_ux</code>: page-level code analysis, vision analysis, screenshot gallery, and synthesized UX outputs.</li>
                                    <li><code>reverse_eng_backend</code>: endpoint inventory, data model, deployment model, integrations, and backend architecture markdown.</li>
                                    <li><code>reverse_eng_events</code>: timeline of orchestration, auth pauses, screenshot capture, Jules stages, and completion/failure events.</li>
                                </ul>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-card/40 p-4">
                                <h3 className="mb-2 font-semibold text-foreground">Preview and Auth Waterfall</h3>
                                <ol className="list-decimal pl-5 space-y-1">
                                    <li>Parse <code>wrangler.jsonc</code> or <code>wrangler.toml</code> and resolve <code>https://{'{worker-name}'}.hacolby.app</code>.</li>
                                    <li>Fallback to the explicit frontend URL provided by the user.</li>
                                    <li>Fallback again to Sandbox preview hosted on <code>core-github-api.hacolby.workers.dev</code>.</li>
                                    <li>Before screenshots, inspect frontend code for auth requirements such as <code>WORKER_API_KEY</code>, <code>AGENTIC_WORKER_API_KEY</code>, cookies, query params, or custom headers.</li>
                                    <li>If auth is required and not supplied, pause the snapshot in <code>awaiting_auth</code> and resume only when the user provides the method.</li>
                                </ol>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
