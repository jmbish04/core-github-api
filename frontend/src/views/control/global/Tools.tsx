import { useParams, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wrench } from "lucide-react";
import { PrCommentExtractor } from "@/components/tools/PrCommentExtractor";
import { CloudflareDocsTool } from "@/components/tools/CloudflareDocsTool";

export default function ToolsPage() {
    const { owner, repo, tool_name } = useParams();
    const navigate = useNavigate();

    // Default to 'pr-extractor' if no tab is provided in the URL
    const activeTab = tool_name || "pr-extractor";
    const isProjectContext = !!(owner && repo);

    const handleTabChange = (val: string) => {
        if (isProjectContext) {
            navigate(`/project/${owner}/${repo}/tools/${val}`);
        } else {
            navigate(`/tools/${val}`);
        }
    };

    return (
        <div className="flex h-screen bg-background text-foreground">
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-14 border-b flex items-center px-4 md:px-6 bg-card/50 backdrop-blur justify-between">
                    <h1 className="font-semibold text-lg flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-muted-foreground" />
                        {isProjectContext ? `Tools: ${owner}/${repo}` : 'Global Tools'}
                    </h1>
                </header>

                <div className="flex-1 p-4 md:p-8 overflow-y-auto">
                    <div className="max-w-5xl mx-auto">
                        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-6">
                            <TabsList className="bg-muted/50">
                                <TabsTrigger value="pr-extractor">PR Comment Extractor</TabsTrigger>
                                <TabsTrigger value="cloudflare-docs">Cloudflare Docs Agent</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="pr-extractor" className="outline-none">
                                <PrCommentExtractor defaultOwner={owner} defaultRepo={repo} />
                            </TabsContent>

                            <TabsContent value="cloudflare-docs" className="outline-none">
                                <CloudflareDocsTool defaultOwner={owner} defaultRepo={repo} />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </main>
        </div>
    );
}
