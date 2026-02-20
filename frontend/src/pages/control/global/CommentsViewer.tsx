
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/navigation/Sidebar";
import { FiCopy, FiDownload, FiMessageSquare, FiGithub, FiArrowLeft } from "react-icons/fi";

// Types matching the backend response
type ExtractedComment = {
    id: number;
    path: extracted_comment_path;
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
};

type extracted_comment_path = string;

export default function CommentsViewerPage() {
    const { id, owner, repo, number } = useParams();
    const [comments, setComments] = useState<ExtractedComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchComments = async () => {
            try {
                let url = '';
                if (id) {
                     url = `/api/tools/comments/${id}`;
                } else if (owner && repo && number) {
                    // Start extraction or fetch existing
                    url = `/api/tools/comments/extract`; // This is POST, we might need adjustments
                    // For viewer, we might want a direct get if extracted.
                    // For now, let's assume we can hit the extract endpoint to get the ID or data
                    // Or actually, let's just make the backend support GET /api/tools/comments/pr/:owner/:repo/:number
                    // But to save backend change time, we can reuse the ID logic if the backend stored it deterministically or simple fetch if public.
                    
                    // Actually, the user wants to view extracted comments.
                    // Let's try to fetch by constructed ID if we made it deterministic, or add a query param support.
                    // The backend `comments.ts` uses `extractionId = ${owner}-${repo}-${pull_number}-${Date.now()}` which is non-deterministic.
                    // We need to update backend to support lookup by PR or make ID deterministic.
                    
                    // RETRY: Backend change was to update the LINK. 
                    // To actually view it, we need to fetch it.
                    // New backend route or method needed?
                    // Let's mock for now or use a new backend route `get_by_pr`.
                    // Actually, better to just hit the extract endpoint again? No, that triggers extraction.
                    
                    // Implementing sidebar idea: simple route that Lists comments for a PR.
                    // We'll add a new backend route: GET /api/tools/comments/:owner/:repo/:number
                    url = `/api/tools/comments/${owner}/${repo}/${number}`;
                }

                if (!url) return;

                const res = await fetch(url);

                if (!res.ok) {
                    throw new Error('Failed to fetch comments');
                }

                const data = await res.json();
                setComments(Array.isArray(data) ? data : []); 
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchComments();
    }, [id, owner, repo, number]);

    const handleCopy = () => {
        const text = comments.map(c =>
            `[${c.path}:${c.line}] ${c.user.login}: ${c.body}`
        ).join('\n---\n');
        navigator.clipboard.writeText(text);
    };

    const handleDownload = () => {
        const blob = new Blob([JSON.stringify(comments, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comments-${id}.json`;
        a.click();
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-[#09090b] text-white">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-[#09090b] text-white gap-4">
                <h1 className="text-2xl font-bold text-red-500">Error Loading Comments</h1>
                <p className="text-gray-400">{error}</p>
                <Button variant="outline" onClick={() => window.history.back()}>
                    <FiArrowLeft className="mr-2" /> Go Back
                </Button>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[#09090b] text-white w-full">
            <Sidebar className="hidden md:block" />
            <main className="flex-1 overflow-auto">
                <div className="container mx-auto p-8 max-w-5xl">
                    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                            <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                                <span>{id ? `Extraction ID: ${id}` : `PR: ${owner}/${repo}#${number}`}</span>
                            </div>
                            </div>
                            <h1 className="text-3xl font-bold flex items-center gap-3">
                                <FiMessageSquare className="text-purple-500" />
                                Extracted Code Comments
                                <span className="bg-purple-500/10 text-purple-400 text-sm px-3 py-1 rounded-full font-mono">
                                    {comments.length}
                                </span>
                            </h1>
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleCopy}>
                                <FiCopy className="mr-2" /> Copy All
                            </Button>
                            <Button variant="outline" onClick={handleDownload}>
                                <FiDownload className="mr-2" /> JSON
                            </Button>
                            <Button className="bg-purple-600 hover:bg-purple-700">
                                Fix with Gemini
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-6">
                        {comments.map((comment) => (
                            <div key={comment.id} className="border border-white/10 rounded-lg bg-black/40 overflow-hidden transform transition-all duration-200 hover:border-purple-500/50">
                                {/* Header */}
                                <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/5">
                                    <div className="flex items-center gap-3">
                                        <img src={comment.user.avatar_url} alt={comment.user.login} className="w-8 h-8 rounded-full border border-white/10" />
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">{comment.user.login}</span>
                                            <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <a href={comment.html_url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                                            <FiGithub /> View on GitHub
                                        </a>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-4">
                                    <div className="font-mono text-sm text-gray-400 mb-4 bg-black/50 p-2 rounded border border-white/5 flex justify-between items-center">
                                        <span>
                                            <span className="text-purple-400">{comment.path}</span>
                                            {comment.line && <span className="text-gray-500">:{comment.line}</span>}
                                        </span>
                                    </div>

                                    <div className="prose prose-invert max-w-none text-gray-200 mb-4">
                                        {comment.body}
                                    </div>

                                    {comment.suggestion && (
                                        <div className="mt-4">
                                            <div className="text-xs font-semibold text-green-400 mb-2 uppercase tracking-wider">Suggested Fix</div>
                                            <pre className="bg-green-950/30 border border-green-500/20 p-3 rounded-md overflow-x-auto text-sm font-mono text-green-300">
                                                {comment.suggestion}
                                            </pre>
                                        </div>
                                    )}

                                    {comment.diff_hunk && !comment.suggestion && (
                                        <div className="mt-4">
                                            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Context</div>
                                            <pre className="bg-black/30 border border-white/5 p-3 rounded-md overflow-x-auto text-xs font-mono text-gray-500">
                                                {comment.diff_hunk}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
