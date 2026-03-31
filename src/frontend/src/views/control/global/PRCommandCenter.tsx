// frontend/src/pages/PRCommandCenterPage.tsx
import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PRCommandCenter as PRCommandCenterComponent } from '@/components/PRCommandCenter';
import { Loader2 } from 'lucide-react';

export const PRCommandCenter: React.FC = () => {
    const params = useParams();
    const owner = params.owner || '';
    const repo = params.repo || '';

    const overviewQuery = useQuery({
        queryKey: ['project-overview', owner, repo],
        enabled: Boolean(owner && repo),
        queryFn: async () => {
            const res = await fetch(
                `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/overview`,
                { credentials: 'include' }
            );
            if (!res.ok) throw new Error('Failed to load project overview');
            return ((await res.json()) as any) as { success: boolean; pendingPrs: any[]; repository: { owner: string; name: string } };
        },
    });

    if (overviewQuery.isLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="p-4">
            <PRCommandCenterComponent
                repoOwner={overviewQuery.data?.repository?.owner || owner}
                repoName={overviewQuery.data?.repository?.name || repo}
                initialPrs={overviewQuery.data?.pendingPrs || []}
            />
        </div>
    );
};
