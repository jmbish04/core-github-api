import { drizzle } from 'drizzle-orm/d1';
import { researchRecommendations } from '@/db/schemas/github/research';
import { isNotNull, desc } from 'drizzle-orm';
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";


export async function runDeepResearch(env: any, topic: string = "topic:cloudflare-worker OR topic:cloudflare-pages") {
  console.log("[Orchestrator] Starting GitHub Deep Research Swarm...");
  const db = drizzle(env.DB);

  // 1. HITL: Fetch historical user feedback to train the Judge (Q-learning approach)
  const historicalFeedback = await db.select()
    .from(researchRecommendations)
    .where(isNotNull(researchRecommendations.humanFeedback))
    .orderBy(desc(researchRecommendations.createdAt))
    .limit(10);
    
  const userPreferences = historicalFeedback.map(f => 
    `- Repo: ${f.repoName} | Rating: ${f.humanRating}/5 | Feedback: "${f.humanFeedback}"`
  ).join('\n');

  // 2. ORCHESTRATOR: Fetch from GitHub API (Past 30 days)
  const dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const searchQuery = `${topic} created:>${dateFilter}`;
  
  const ghResponse = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc&per_page=20`, {
    headers: { 
      'User-Agent': 'Cloudflare-Agent-Swarm', 
      'Authorization': `Bearer ${env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!ghResponse.ok) throw new Error("GitHub API error");
  const ghData = await ghResponse.json() as any;
  const repos = ghData.items || [];

  // 3. DEDUPLICATION: Check D1 for existing repos
  const existingRecords = await db.select({ id: researchRecommendations.id }).from(researchRecommendations);
  const existingIds = new Set(existingRecords.map(r => r.id));
  const newRepos = repos.filter((r: any) => !existingIds.has(r.full_name)).slice(0, 10); 

  if (newRepos.length === 0) {
    console.log("[Orchestrator] No new repos found.");
    return { status: 'no_new_repos' };
  }

  // 4. PARALLELIZATION: Farm out unanalyzed repos to Worker AI Swarm
  const evaluatedRepos = await Promise.all(newRepos.map(async (repo: any) => {
    // Optionally fetch README here
    const readmeRes = await fetch(`https://api.github.com/repos/${repo.full_name}/readme`, {
       headers: { 'User-Agent': 'Cloudflare-Agent-Swarm', 'Accept': 'application/vnd.github.v3.raw', 'Authorization': `Bearer ${env.GITHUB_PERSONAL_ACCESS_TOKEN}` }
    });
    const readme = readmeRes.ok ? await readmeRes.text() : "";

    const systemPrompt = `You are a GitHub Repository Evaluator. Evaluate this repo for a developer.
Learn from their past feedback:
${userPreferences || "No past feedback. Look for highly innovative, serverless projects."}

Repository: ${repo.full_name}
Description: ${repo.description}
Topics: ${repo.topics?.join(', ')}
README Snippet: ${readme.substring(0, 1500)}

Evaluate on a scale of 1-10. You MUST respond with ONLY valid JSON: {"score": <number>, "reasoning": "<1-2 sentences why>"}`;

    try {
      const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [{ role: 'user', content: systemPrompt }]
      });

      const jsonStr = (aiResponse as any).response.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      const judgment = JSON.parse(jsonStr);
      
      return { ...repo, aiScore: judgment.score, aiReasoning: judgment.reasoning };
    } catch (e) {
      console.error(`Failed AI judgment for ${repo.full_name}`, e);
      return null;
    }
  }));

  const successfulEvaluations = evaluatedRepos.filter(r => r !== null && r.aiScore >= 6);

  // 5. STORE IN D1
  if (successfulEvaluations.length > 0) {
    const inserts = successfulEvaluations.map(e => ({
      id: e.full_name,
      topic: topic,
      repoName: e.full_name,
      repoUrl: e.html_url,
      description: e.description,
      stars: e.stargazers_count,
      aiScore: e.aiScore,
      aiReasoning: e.aiReasoning
    }));
    await db.insert(researchRecommendations).values(inserts).onConflictDoNothing();

    // 6. ALERT: Email Routing
    if (env.SEND_EMAIL_NEWSLETTER) {
      try {
        const { sendRepoDiscoveryEmail } = await import("@/utils/email/send/repo-discovery");
        await sendRepoDiscoveryEmail(env, {
          subject: `GitHub Trends Discovered: ${successfulEvaluations.length} new repos`,
          title: `GitHub Trends Discovered: ${successfulEvaluations.length} new repos`,
          dailyTrendsData: {
            date: new Date().toLocaleDateString(),
            trend_summary: `Found ${successfulEvaluations.length} highly relevant repositories for ${topic}. Log into the Command Center to rate these and train your AI!`,
            top_picks: successfulEvaluations.map(c => ({
              name: c.full_name,
              url: c.html_url,
              category: topic,
              why_its_interesting: c.aiReasoning,
              innovation_score: c.aiScore
            }))
          },
          plainTextFallback: `GitHub Trends Discovered: ${successfulEvaluations.length} new repos. Check dashboard.`
        });
      } catch (e) {
        console.error("Email send failed", e);
      }
    }
  }

  return { status: 'success', evaluated: newRepos.length, recommended: successfulEvaluations.length };
}

export type DeepResearchPayload = {
  topic?: string;
  repoUrl?: string;
  repoOwner?: string;
  repoName?: string;
  mode?: string;
};

export class DeepResearchWorkflow extends WorkflowEntrypoint<any, DeepResearchPayload> {
  async run(event: Readonly<WorkflowEvent<DeepResearchPayload>>, step: WorkflowStep) {
    const topic = event.payload?.topic || "topic:cloudflare-worker OR topic:cloudflare-pages";
    
    const result = await step.do("run-research-swarm", async () => {
      return await runDeepResearch(this.env, topic);
    });

    return result;
  }
}
