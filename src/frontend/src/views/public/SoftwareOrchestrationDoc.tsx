import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Workflow, Layers, GitBranch, Terminal } from "lucide-react";

export default function SoftwareOrchestrationDoc() {
    return (
        <div className="container mx-auto py-10 max-w-4xl space-y-8">
            <div className="space-y-4">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-blue-600 dark:text-blue-500">
                    Software Orchestration
                </h1>
                <p className="text-xl text-muted-foreground">
                    Coordinating distributed AI agents to plan, research, and implement complex features autonomously.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-blue-200 dark:border-blue-900 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Layers className="h-5 w-5 text-blue-500" /> 
                          Multi-Agent Architecture
                        </CardTitle>
                        <CardDescription>Hierarchical Delegation</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        The <strong>SoftwareEngineerAgent</strong> acts as a supervisor, delegating specialized tasks to Jules (coding), Cloudflare Docs (research), and the Sandbox (verification).
                    </CardContent>
                </Card>

                <Card className="border-purple-200 dark:border-purple-900 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Workflow className="h-5 w-5 text-purple-500" /> 
                          Planning Room
                        </CardTitle>
                        <CardDescription>Collaborative Feature Design</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Interactive sessions where multiple agents and users collaborate to refine implementation plans before any code is generated or modified.
                    </CardContent>
                </Card>

                 <Card className="border-green-200 dark:border-green-900 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <GitBranch className="h-5 w-5 text-green-500" /> 
                          Repo-Scoped Workflows
                        </CardTitle>
                        <CardDescription>Context-Aware Execution</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Synchronize work across global views or deep-dive into specific repositories using shared context and standardized project mapping.
                    </CardContent>
                </Card>

                <Card className="border-orange-200 dark:border-orange-900 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Terminal className="h-5 w-5 text-orange-500" /> 
                          API Integration
                        </CardTitle>
                        <CardDescription>JIT Token & SDK Support</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Utilizes the Cloudflare Agents SDK for stateful memory and JIT tokens for secure, zero-touch authentication during deployment.
                    </CardContent>
                </Card>
            </div>

            <div className="prose dark:prose-invert max-w-none border-t pt-8">
                <h2>The Lifecycle</h2>
                <div className="space-y-6">
                    <div>
                        <h4 className="flex items-center gap-2 underline decoration-blue-500 underline-offset-4">Phase 1: Research & Discovery</h4>
                        <p>The system triggers <code>JulesResearchWorkflow</code> to scan the repository, extract documentation context, and map existing patterns.</p>
                    </div>
                    <div>
                         <h4 className="flex items-center gap-2 underline decoration-purple-500 underline-offset-4">Phase 2: Planning & Approval</h4>
                        <p>Agents generate a <code>PlanRevision</code> artifact. You can review, chat with the planning room, and explicitly approve the roadmap.</p>
                    </div>
                    <div>
                         <h4 className="flex items-center gap-2 underline decoration-green-500 underline-offset-4">Phase 3: Autonomous Implementation</h4>
                        <p>Upon approval, the <code>SoftwareEngineerAgent</code> executes the implementation in a sandboxed environment and generates the final Pull Request.</p>
                    </div>
                </div>

                <div className="mt-10 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900">
                    <h3 className="text-blue-700 dark:text-blue-400 mt-0">API Example: Start Orchestration</h3>
                    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-xs">
{`POST /api/jules/orchestrate
{
  "repo": "owner/name",
  "prompt": "Refactor the authentication middleware to support JWT rotation",
  "context": { "branch": "main" }
}`}
                    </pre>
                </div>
            </div>
        </div>
    );
}
