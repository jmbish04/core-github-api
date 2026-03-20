/**
 * @file frontend/src/views/control/global/ProjectCloudflareDocsPage.tsx
 * @description Cloudflare Docs Agent embedded within a project workspace or PR context.
 * Pre-fills and locks the GitHub repo URL so the agent has immediate codebase awareness.
 */

import React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CloudflareDocsTool } from "@/components/tools/CloudflareDocsTool";
import { Loader2, Cloud, GitPullRequest } from "lucide-react";

interface ProjectCloudflareDocsPageProps {
    /** "project-tools" | "pr" — controls the source tag logged to D1 */
    source: "project-tools" | "pr";
}

export default function ProjectCloudflareDocsPage({ source }: ProjectCloudflareDocsPageProps) {
    const { owner, repo, prNumber } = useParams<{
        owner: string;
        repo: string;
        prNumber?: string;
    }>();

    // If this is a PR page, fetch the PR's head branch to pass as the repo URL
    const prQuery = useQuery({
        queryKey: ["pr-branch", owner, repo, prNumber],
        enabled: source === "pr" && Boolean(owner && repo && prNumber),
        queryFn: async () => {
            const res = await fetch(
                `/api/github/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}/pulls/${prNumber}`,
                { credentials: "include" }
            );
            if (!res.ok) return null;
            return ((await res.json()) as any) as { head?: { ref?: string } };
        },
    });

    if (source === "pr" && prQuery.isLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Branch-aware repo URL for PR context; fallback to main branch
    const prBranch = prQuery.data?.head?.ref;
    const repoUrl = `https://github.com/${owner}/${repo}${prBranch ? `/tree/${prBranch}` : ""}`;

    return (
        <div className="flex flex-col h-full p-4 md:p-6 gap-4">
            {/* Context banner */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground border-b pb-3">
                {source === "pr" ? (
                    <>
                        <GitPullRequest className="w-4 h-4 text-violet-500" />
                        <span>
                            Cloudflare Docs Agent — PR{" "}
                            <span className="font-medium text-foreground">#{prNumber}</span>
                            {prBranch && (
                                <> · branch <code className="font-mono text-xs bg-muted px-1 rounded">{prBranch}</code></>
                            )}
                        </span>
                    </>
                ) : (
                    <>
                        <Cloud className="w-4 h-4 text-orange-500" />
                        <span>
                            Cloudflare Docs Agent —{" "}
                            <span className="font-medium text-foreground">{owner}/{repo}</span>
                        </span>
                    </>
                )}
            </div>

            <div className="flex-1 min-h-0">
                <CloudflareDocsTool
                    defaultOwner={owner}
                    defaultRepo={repo}
                    source={source}
                    locked={true}
                />
            </div>
        </div>
    );
}
