import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check, ExternalLink, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ExtractedComment {
    id: number;
    path: string;
    line: number | null;
    start_line?: number | null;
    original_line?: number | null;
    body: string;
    diff_hunk?: string;
    suggestion?: string;
    user: {
        login: string;
        avatar_url: string;
    };
    created_at: string;
    html_url: string;
}

interface PrCommentExtractorProps {
    defaultOwner?: string;
    defaultRepo?: string;
}

export function PrCommentExtractor({ defaultOwner, defaultRepo }: PrCommentExtractorProps) {
    const [url, setUrl] = useState("");
    const [prs, setPrs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [comments, setComments] = useState<ExtractedComment[]>([]);
    const [extractionId, setExtractionId] = useState<string | null>(null);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', title: string, message: string } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (defaultOwner && defaultRepo) {
            setUrl(`https://github.com/${defaultOwner}/${defaultRepo}`);
            fetch(`https://api.github.com/repos/${defaultOwner}/${defaultRepo}/pulls?state=open&sort=created&direction=desc`)
              .then(res => res.json())
              .then(data => {
                  if (Array.isArray(data)) {
                      setPrs(data);
                  }
              })
              .catch(console.error);
        }
    }, [defaultOwner, defaultRepo]);

    const handlePrSelect = (prNumber: string) => {
        if (defaultOwner && defaultRepo) {
            setUrl(`https://github.com/${defaultOwner}/${defaultRepo}/pull/${prNumber}`);
        }
    };

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
            return null;
        }
        return null;
    };

    const handleExtract = async () => {
        setStatus(null);
        const params = parsePrUrl(url);
        if (!params) {
            setStatus({
                type: 'error',
                title: "Invalid URL",
                message: "Please provide a valid GitHub PR URL containing '/pull/123'."
            });
            return;
        }

        setLoading(true);
        setComments([]);
        setExtractionId(null);

        try {
            // 1. Extract comments
            const res = await fetch('/api/tools/comments/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            
            if (!res.ok) throw new Error("Failed to extract comments");
            
            const data = await res.json();
            
            if (data.success && data.extraction_id) {
                setExtractionId(data.extraction_id);
                
                // 2. Fetch the comments using the extraction ID
                const commentsRes = await fetch(`/api/tools/comments/${data.extraction_id}`);
                if (!commentsRes.ok) throw new Error("Failed to fetch extracted comments");
                
                const commentsData = await commentsRes.json();
                setComments(commentsData);
                
                setStatus({
                    type: 'success',
                    title: "Success",
                    message: `Extracted ${commentsData.length} comments.`
                });
            } else {
                throw new Error("Extraction failed on backend");
            }

        } catch (error: any) {
            setStatus({
                type: 'error',
                title: "Error",
                message: error.message
            });
        } finally {
            setLoading(false);
        }
    };

    const formatForAI = () => {
        let text = `Here are the code review comments for PR ${url}:\n\n`;
        
        // Group by file
        const byFile: Record<string, ExtractedComment[]> = {};
        comments.forEach(c => {
            if (!byFile[c.path]) byFile[c.path] = [];
            byFile[c.path].push(c);
        });

        Object.keys(byFile).forEach(file => {
            text += `### File: \`${file}\`\n\n`;
            byFile[file].forEach(c => {
                text += `#### Line ${c.line || c.original_line || 'Global'}: ${c.user.login}\n`;
                if (c.diff_hunk) {
                    text += "```diff\n" + c.diff_hunk + "\n```\n";
                }
                text += `> ${c.body.replace(/\n/g, '\n> ')}\n\n`;
                if (c.suggestion) {
                    text += "**Suggestion:**\n```typescript\n" + c.suggestion + "\n```\n\n";
                }
                text += "---\n\n";
            });
        });

        return text;
    };

    const copyToClipboard = () => {
        const text = formatForAI();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        setStatus({
            type: 'success',
            title: "Copied!",
            message: "Comments formatted for AI context copied to clipboard."
        });
        // Clear success message after 3 seconds
        setTimeout(() => setStatus(null), 3000);
    };

    return (
        <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
                <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    PR Comment Extractor
                </CardTitle>
                <CardDescription>
                    Extract code review comments from a GitHub Pull Request URL to feed into your AI coding agent.
                </CardDescription>
            </CardHeader>
            <CardContent className="px-0 flex-1 flex flex-col gap-6">
                
                {prs.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <Label>Active Pull Requests for {defaultOwner}/{defaultRepo}</Label>
                        <Select onValueChange={handlePrSelect}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select an active PR to analyze..." />
                            </SelectTrigger>
                            <SelectContent>
                                {prs.map(pr => (
                                    <SelectItem key={pr.number} value={pr.number.toString()}>
                                        #{pr.number} - {pr.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="pr-url" className="text-xs">PR URL</Label>
                        <Input 
                            id="pr-url" 
                            placeholder="https://github.com/owner/repo/pull/123" 
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleExtract} disabled={loading || !url}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {loading ? "Extracting..." : "Extract Comments"}
                    </Button>
                </div>

                {status && (
                    <Alert variant={status.type === 'error' ? 'destructive' : 'default'} className="animate-in fade-in slide-in-from-top-2">
                        {status.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        <AlertTitle>{status.title}</AlertTitle>
                        <AlertDescription>{status.message}</AlertDescription>
                    </Alert>
                )}

                {comments.length > 0 && (
                    <div className="bg-muted/30 border rounded-lg flex flex-col flex-1 overflow-hidden">
                        <div className="p-3 border-b flex items-center justify-between bg-muted/50">
                            <span className="text-sm font-medium">{comments.length} Comments Found</span>
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                className="h-8 gap-2" 
                                onClick={copyToClipboard}
                            >
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? "Copied" : "Copy for AI"}
                            </Button>
                        </div>
                        <ScrollArea className="flex-1 p-4 h-[400px]">
                            <div className="space-y-6">
                                {Object.entries(
                                    comments.reduce((acc, c) => {
                                        if (!acc[c.path]) acc[c.path] = [];
                                        acc[c.path].push(c);
                                        return acc;
                                    }, {} as Record<string, ExtractedComment[]>)
                                ).map(([file, fileComments]) => (
                                    <div key={file} className="space-y-3">
                                        <h3 className="text-sm font-semibold bg-primary/10 text-primary px-2 py-1 rounded w-fit font-mono">
                                            {file}
                                        </h3>
                                        <div className="pl-3 border-l-2 space-y-4">
                                            {fileComments.map(comment => (
                                                <div key={comment.id} className="text-sm space-y-2">
                                                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                                        <span className="font-medium text-foreground">{comment.user.login}</span>
                                                        <span>•</span>
                                                        <span>Line {comment.line || comment.original_line || 'Global'}</span>
                                                        <a href={comment.html_url} target="_blank" rel="noreferrer">
                                                            <ExternalLink className="w-3 h-3 hover:text-foreground cursor-pointer" />
                                                        </a>
                                                    </div>
                                                    
                                                    {comment.diff_hunk && (
                                                        <div className="bg-muted/50 p-2 rounded overflow-x-auto text-xs font-mono text-muted-foreground whitespace-pre">
                                                             {comment.diff_hunk.split('\n').slice(-4).join('\n')}
                                                        </div>
                                                    )}

                                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                                        <p className="whitespace-pre-wrap">{comment.body}</p>
                                                    </div>

                                                    {comment.suggestion && (
                                                        <div className="bg-green-500/10 border border-green-500/20 p-2 rounded">
                                                            <div className="text-xs text-green-500 font-medium mb-1">Suggestion:</div>
                                                            <pre className="text-xs font-mono overflow-x-auto">{comment.suggestion}</pre>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                )}

                {!loading && comments.length === 0 && extractionId && (
                   <div className="text-center text-muted-foreground p-8">
                       No code comments found on this PR.
                   </div>
                )}
            </CardContent>
        </Card>
    );
}
