import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BookOpen, Code, Search, MessageSquare } from "lucide-react";

export default function CloudflareDocsInfo() {
    return (
        <div className="container mx-auto py-10 max-w-4xl space-y-8">
            <div className="space-y-4">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-orange-600 dark:text-orange-500">
                    Cloudflare Docs Agent
                </h1>
                <p className="text-xl text-muted-foreground">
                    Your intelligent companion for building on the Cloudflare Developer Platform.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-blue-500" /> Deep Search</CardTitle>
                        <CardDescription>Official Documentation Access</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        The agent can search across Workers, Pages, D1, R2, and Zero Trust documentation to find the exact configuration or API you need.
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Code className="h-5 w-5 text-purple-500" /> Context Aware</CardTitle>
                        <CardDescription>Understands Your Code</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Select your active repository, and the agent will tailor its answers to your specific tech stack (Hono, Astro, Python) and existing configuration.
                    </CardContent>
                </Card>
            </div>

            <div className="prose dark:prose-invert max-w-none">
                <h3>How to use</h3>
                <ol>
                    <li>Navigate to <strong>Tools &gt; Cloudflare Chat</strong>.</li>
                    <li>Select the <strong>Repository Context</strong> you are working on.</li>
                    <li>Ask a question like <em>"How do I add a D1 binding to my wrangler.jsonc?"</em></li>
                    <li>The agent will search the docs and provide a code snippet tailored to your selected repo.</li>
                </ol>
            </div>
        </div>
    );
}
