import { StatCard } from '@/components/ui/diceui/stat';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Activity, GitPullRequest, AlertCircle } from 'lucide-react';

export function RepoHealthCard() {
    const repoParams = { owner: 'colby-dev', repo: 'core-api' };

    const { data } = useQuery({
        queryKey: ['stats', repoParams],
        queryFn: async () => {
            const res = await axios.get(`/api/repos/${repoParams.owner}/${repoParams.repo}/stats`);
            return res.data.stats || { healthScore: 0, openIssuesCount: 0, prsMergedThisWeek: 0 };
        },
        initialData: { healthScore: 0, openIssuesCount: 0, prsMergedThisWeek: 0 }
    });

    return (
        <div className="space-y-4">
            <StatCard
                title="Repo Health"
                value={`${data.healthScore}%`}
                trend={data.healthScore > 80 ? 'up' : 'down'}
                trendValue="vs last week"
                icon={<Activity className="w-4 h-4" />}
                className="bg-zinc-900/50 border-zinc-800"
            />

            <div className="grid grid-cols-2 gap-4">
                <StatCard
                    title="Open Issues"
                    value={data.openIssuesCount}
                    icon={<AlertCircle className="w-4 h-4 text-orange-400" />}
                    className="bg-zinc-900/30"
                />
                <StatCard
                    title="Merged PRs"
                    value={data.prsMergedThisWeek}
                    trend="up"
                    trendValue="+2"
                    icon={<GitPullRequest className="w-4 h-4 text-purple-400" />}
                    className="bg-zinc-900/30"
                />
            </div>
        </div>
    );
}
