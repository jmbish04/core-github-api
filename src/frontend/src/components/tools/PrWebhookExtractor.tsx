import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Copy, Check, Webhook } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { handleGlobalError } from "@/lib/error-handler";

interface PrWebhookExtractorProps {
    defaultOwner?: string;
    defaultRepo?: string;
    defaultPrNumber?: number | null;
}

export function PrWebhookExtractor({ defaultOwner, defaultRepo, defaultPrNumber }: PrWebhookExtractorProps) {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [payload, setPayload] = useState<any | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (defaultOwner && defaultRepo) {
            const baseUrl = `https://github.com/${defaultOwner}/${defaultRepo}`;
            if (defaultPrNumber) {
                const fullUrl = `${baseUrl}/pull/${defaultPrNumber}`;
                setUrl(fullUrl);
            } else {
                setUrl(baseUrl);
            }
        }
    }, [defaultOwner, defaultRepo, defaultPrNumber]);

    const parsePrUrl = (urlStr: string) => {
        try {
            const u = new URL(urlStr);
            const parts = u.pathname.split('/');
            if (parts.length >= 5 && parts[3] === 'pull') {
                return {
                    owner: parts[1],
                    repo: parts[2],
                    pull_number: parseInt(parts[4], 10)
                };
            }
        } catch (e) {
            console.error(`Error parsing PR URL: ${JSON.stringify(e)}`)
            return null;
        }
        return null;
    };

    const handleFetchPayload = async () => {
        const params = parsePrUrl(url);
        if (!params) {
            toast.error("Please provide a valid GitHub PR URL (e.g., https://github.com/owner/repo/pull/123)");
            return;
        }

        setLoading(true);
        setPayload(null);

        try {
            const res = await fetch(`/api/webhooks/${params.owner}/${params.repo}/pr/${params.pull_number}/initial`);
            
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error(`Invalid response from server (expected JSON, got ${contentType}). The endpoint might not exist or the backend failed to route it.`);
            }

            const data = await res.json() as any;

            if (!res.ok || !data.success) {
                throw new Error(data.error || "Failed to fetch initial webhook payload");
            }

            let parsedPayload = data.data.payload;
            if (typeof parsedPayload === 'string') {
                try {
                    parsedPayload = JSON.parse(parsedPayload);
                } catch {
                    // Keep as string if parsing fails
                }
            }
            setPayload(parsedPayload || data.data);
            toast.success("Initial PR Webhook payload retrieved");
        } catch (error: unknown) {
            handleGlobalError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (payload) {
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success("Payload copied to clipboard");
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Webhook className="w-5 h-5" />
                    Initial PR Webhook Extractor
                </CardTitle>
                <CardDescription>
                    Pull the exact initial (action=opened) webhook payload for any given Pull Request.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex gap-2">
                    <Input 
                        placeholder="https://github.com/owner/repo/pull/123" 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleFetchPayload()}
                        className="flex-1"
                    />
                    <Button onClick={handleFetchPayload} disabled={loading || !url}>
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Webhook className="w-4 h-4 mr-2" />}
                        Fetch Payload
                    </Button>
                </div>

                {payload && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium">Raw Payload</h3>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleCopy}
                                className="h-8"
                            >
                                {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
                                {copied ? 'Copied' : 'Copy JSON'}
                            </Button>
                        </div>
                        <ScrollArea className="h-[500px] w-full rounded-md border bg-muted/50 p-4">
                            <pre className="text-xs font-mono break-all whitespace-pre-wrap">
                                {JSON.stringify(payload, null, 2)}
                            </pre>
                        </ScrollArea>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
