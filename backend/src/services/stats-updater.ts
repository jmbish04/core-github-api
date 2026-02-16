
import { getDb } from "@db";
import { repoStats, repos } from "@db/schema";
import { getOctokit } from "./octokit/core";
import { eq, sql } from "drizzle-orm";

export async function updateRepoStats(env: Env, owner: string, repo: string) {
    const db = getDb(env.DB);
    const octokit = await getOctokit(env);

    try {
        // 1. Fetch Repository to get Internal ID
        const repoRecord = await db.select().from(repos).where(eq(repos.name, repo)).limit(1);
        if (!repoRecord.length) {
            console.error(`Repo not found in DB: ${owner}/${repo}`);
            return;
        }
        const repoId = repoRecord[0].id;

        // 2. Fetch Data from GitHub
        const { data: repository } = await octokit.repos.get({ owner, repo });
        const { data: pulls } = await octokit.pulls.list({ owner, repo, state: 'closed', sort: 'updated', direction: 'desc', per_page: 100 });
        
        // Filter PRs merged in last 7 days
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const mergedPRs = pulls.filter(pr => pr.merged_at && new Date(pr.merged_at) > oneWeekAgo);

        // 3. Calculate Stats
        const healthScore = calculateHealthScore(repository.open_issues_count, mergedPRs.length);

        // 4. Update DB
        const existingStats = await db.select().from(repoStats).where(eq(repoStats.repoId, repoId)).limit(1);

        if (existingStats.length) {
            await db.update(repoStats).set({
                healthScore,
                openIssuesCount: repository.open_issues_count,
                prsMergedThisWeek: mergedPRs.length,
                lastUpdated: new Date().toISOString()
            }).where(eq(repoStats.repoId, repoId));
        } else {
            await db.insert(repoStats).values({
                repoId,
                healthScore,
                openIssuesCount: repository.open_issues_count,
                prsMergedThisWeek: mergedPRs.length,
                lastUpdated: new Date().toISOString()
            });
        }

        console.log(`Updated stats for ${owner}/${repo}`);

    } catch (error) {
        console.error(`Failed to update stats for ${owner}/${repo}:`, error);
    }
}

function calculateHealthScore(openIssues: number, mergedPRs: number): number {
    let score = 100;
    // Simple heuristic
    if (openIssues > 50) score -= 20;
    if (openIssues > 20) score -= 10;
    if (mergedPRs > 5) score += 10;
    
    return Math.min(Math.max(score, 0), 100);
}
