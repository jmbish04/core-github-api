import { useParams, useNavigate, Link } from "react-router-dom";
import { Wrench, MessageSquare, Cloud, Webhook, ChevronRight, Factory } from "lucide-react";
import PrCommentExtractorPage from "@/components/tools/toolbox/PrCommentExtractorPage";
import PrWebhookExtractorPage from "@/components/tools/toolbox/PrWebhookExtractorPage";
import CloudflareDocsPage from "@/components/tools/toolbox/CloudflareDocsPage";
import CloudflareDocsBetaPage from "@/components/tools/toolbox/CloudflareDocsBetaPage";
import AgentWorkshop from "@/views/control/global/AgentWorkshop";
import { RegistryDirectory } from "@/components/tools/registry-directory";

const TOOLS = [
    {
        id: "shadcn-registry",
        label: "Shadcn Registry Directory",
        description: "Discover community registries for shadcn/ui components.",
        icon: Wrench,
        color: "text-indigo-400",
        bg: "bg-indigo-500/10 border-indigo-500/20",
    },
    {
        id: "pr-extractor",
        label: "PR Comment Extractor",
        description: "Extract code review comments from a GitHub PR to feed into your AI coding agent.",
        icon: MessageSquare,
        color: "text-blue-400",
        bg: "bg-blue-500/10 border-blue-500/20",
    },
    {
        id: "cloudflare-docs",
        label: "Cloudflare Docs Agent",
        description: "Chat with an AI agent grounded in the official Cloudflare documentation.",
        icon: Cloud,
        color: "text-orange-400",
        bg: "bg-orange-500/10 border-orange-500/20",
    },
    {
        id: "cloudflare-docs-beta",
        label: "Cloudflare Docs Agent [Beta]",
        description: "Next-gen Docs Agent: native assistant-ui, shiki syntax highlighting, and built-in suggestions.",
        icon: Cloud,
        color: "text-orange-300",
        bg: "bg-orange-500/5 border-orange-500/15",
    },
    {
        id: "pr-webhook",
        label: "PR Webhook Extractor",
        description: "Pull the exact initial webhook payload for any given Pull Request.",
        icon: Webhook,
        color: "text-purple-400",
        bg: "bg-purple-500/10 border-purple-500/20",
    },
    {
        id: "agent-factory",
        label: "Agent Workshop",
        description: "Generate Cloudflare Worker blueprints, agent architectures, D1 schemas, and RAG pipelines using Gemini Pro.",
        icon: Factory,
        color: "text-amber-400",
        bg: "bg-amber-500/10 border-amber-500/20",
    },
];

function ToolsLandingPage({ owner, repo }: { owner?: string; repo?: string }) {
    const isProjectContext = !!(owner && repo);
    const basePath = isProjectContext ? `/project/${owner}/${repo}/tools` : "/tools";

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="px-6 py-4 border-b shrink-0 bg-card/50 backdrop-blur">
                <h1 className="text-base font-semibold flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    {isProjectContext ? `Tools — ${owner}/${repo}` : "Global Tools"}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">Select a tool below to get started.</p>
            </div>
            <div className="flex-1 p-6">
                <div className="max-w-3xl mx-auto grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {TOOLS.map(tool => {
                        const Icon = tool.icon;
                        return (
                            <Link
                                key={tool.id}
                                to={`${basePath}/${tool.id}`}
                                className={`group flex flex-col gap-3 p-4 rounded-xl border bg-card/60 hover:bg-card transition-all hover:shadow-md ${tool.bg}`}
                            >
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${tool.bg}`}>
                                    <Icon className={`w-4 h-4 ${tool.color}`} />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-sm">{tool.label}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{tool.description}</p>
                                </div>
                                <div className="flex items-center text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                                    Open tool <ChevronRight className="w-3 h-3 ml-0.5" />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function ToolsPage() {
    const { owner, repo, tool_name } = useParams();

    if (!tool_name) {
        return <ToolsLandingPage owner={owner} repo={repo} />;
    }

    // Route to the dedicated full-page component
    if (tool_name === "pr-extractor") {
        return <PrCommentExtractorPage />;
    }
    if (tool_name === "cloudflare-docs") {
        return <CloudflareDocsPage />;
    }
    if (tool_name === "cloudflare-docs-beta") {
        return <CloudflareDocsBetaPage />;
    }
    if (tool_name === "pr-webhook") {
        return <PrWebhookExtractorPage />;
    }

    if (tool_name === "shadcn-registry") {
        return <RegistryDirectory />;
    }

    if (tool_name === "agent-factory") {
        return <AgentWorkshop />;
    }

    // Unknown tool — show landing
    return <ToolsLandingPage owner={owner} repo={repo} />;
}
