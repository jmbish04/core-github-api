import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Cloud, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CloudflareDocsToolProps {
    defaultOwner?: string;
    defaultRepo?: string;
}

export function CloudflareDocsTool({ defaultOwner, defaultRepo }: CloudflareDocsToolProps) {
    const isLocked = !!(defaultOwner && defaultRepo);
    const [repoUrl, setRepoUrl] = useState(isLocked ? `https://github.com/${defaultOwner}/${defaultRepo}` : "");
    const [messages, setMessages] = useState<{ role: 'user' | 'model', content: string }[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setInput("");
        const newHistory = [...messages, { role: 'user' as const, content: userMsg }];
        setMessages(newHistory);
        setLoading(true);

        try {
            const res = await fetch("/api/agents/cloudflare-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMsg,
                    history: messages,
                    context: {
                        repoUrl: repoUrl || undefined
                    }
                })
            });

            if (!res.ok) throw new Error("Agent response error");
            const data = await res.json();

            setMessages([...newHistory, { role: 'model', content: data.response }]);
        } catch (err: any) {
            setMessages([...newHistory, { role: 'model', content: `Error communicating with agent: ${err.message}` }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
                <CardTitle className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-orange-500" />
                    Cloudflare Docs Agent
                </CardTitle>
                <CardDescription>
                    A specialized Workers AI agent trained on Cloudflare Docs with codebase awareness.
                </CardDescription>
            </CardHeader>
            <CardContent className="px-0 flex-1 flex flex-col gap-4">
                
                <div className="flex gap-2 items-center">
                    <div className="flex-1 flex items-center bg-muted/50 border rounded-md px-3 py-1.5 h-10">
                        <span className="text-xs text-muted-foreground mr-2 whitespace-nowrap">Target Repository:</span>
                        <input
                            type="text"
                            placeholder="https://github.com/owner/repo (Optional)"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            disabled={isLocked}
                            className="bg-transparent border-none outline-none w-full text-sm text-foreground disabled:opacity-50"
                        />
                    </div>
                    {isLocked && <Badge variant="secondary">Project Locked</Badge>}
                </div>

                <div className="bg-card border rounded-lg flex flex-col flex-1 h-[450px]">
                    <ScrollArea className="flex-1 p-4">
                        {messages.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                                Ask about Workers, AI Gateway, Pages, or D1 optimizations...
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-lg p-3 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/80 text-foreground'}`}>
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}
                                {loading && (
                                    <div className="flex justify-start">
                                        <div className="bg-muted/80 rounded-lg p-3">
                                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </ScrollArea>
                    <div className="p-3 border-t bg-card/50 flex gap-2">
                        <Input
                            placeholder="Type your question..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendMessage()}
                            disabled={loading}
                        />
                        <Button onClick={sendMessage} disabled={loading || !input.trim()}>
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
