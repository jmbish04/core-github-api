// @ts-nocheck
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { TopicOrchestratorAgent } from "@agents/TopicOrchestrator";
import { WebSearchAgent } from "@agents/WebSearch";
import { JudgeAgent } from "@agents/Judge";
import { ReportingAgent } from "@agents/Reporting";
import { getDb } from "@db";
import { researchBriefs, researchCandidates, researchPlans } from "@/db/schemas/github/research";
import { eq } from "drizzle-orm";

import { dailyTrends } from "@/db/schemas/github/webhooks";
import { createId } from "@paralleldrive/cuid2";

type ResearchWorkflowParams = {
  briefId: string;
  plan: any;
  mode?: "standard" | "trending";
};

export class TopicResearchWorkflow extends WorkflowEntrypoint<Env, ResearchWorkflowParams> {
  async run(event: WorkflowEvent<ResearchWorkflowParams>, step: WorkflowStep) {
    const { briefId, plan, mode = "standard" } = event.payload;
    
    // 1. Discovery (Search)
    const searchResults = await step.do("discovery-search", async () => {
      // Use the WebSearchAgent. We use the briefId as the ID for consistency/caching if we wanted stateful,
      // but WebSearchAgent is largely stateless tool-user.
      const searchAgentId = this.env.WEB_SEARCH_AGENT.idFromName(briefId);
      const searchAgent = this.env.WEB_SEARCH_AGENT.get(searchAgentId);
      
      const queries: string[] = plan.search_queries || [];
      const allResults: any[] = [];
      
      for (const query of queries.slice(0, 3)) { // Limit to top 3 queries to save time/cost

         const results = await searchAgent.search(briefId, query);
         allResults.push(...results);
      }
      
      return allResults;
    });

    // 2. Judging (Parallel Fan-out)
    const judgedCandidates = await step.do("judge-candidates", async () => {
       const judgeAgentId = this.env.JUDGE_AGENT.idFromName(briefId);
       const judgeAgent = this.env.JUDGE_AGENT.get(judgeAgentId);

       const candidatesToJudge = searchResults.slice(0, 15); // Cap at 15
       const criteria = JSON.stringify(plan.goals);

       const results = await Promise.all(candidatesToJudge.map(async (candidate: any) => {

         const judgement = await judgeAgent.evaluateCandidate(briefId, candidate, criteria);
         
         return { ...candidate, judgement };
       }));

       return results;
    });

    // 3. Save Candidates & Filter
    await step.do("save-and-filter-candidates", async () => {
        const db = getDb(this.env.DB);
        
        // Filter for high quality if trending
        const validCandidates = mode === "trending" 
            ? judgedCandidates.filter((c: any) => c.judgement.score > 70) 
            : judgedCandidates;

        const dailyPicks: any[] = [];

        for (const item of validCandidates) {
            await db.insert(researchCandidates).values({
                briefId,
                sourceUrl: item.url,
                sourceType: "other", // Default/fallback
                initialSummary: item.snippet || item.judgement.reasoning,
                judgeScore: item.judgement.score,
                judgeReasoning: item.judgement.reasoning,
                userRating: "pending",
                // metadata: JSON.stringify(item) // Schema doesn't have metadata col
            });

            if (mode === "trending") {
                dailyPicks.push({
                   name: item.title || "Trending Item",
                   url: item.url,
                   category: plan.topic || "General",
                   why_its_interesting: item.judgement.reasoning,
                   innovation_score: item.judgement.score
                });
            }
        }

        // If trending, save aggregated daily trends
        if (mode === "trending" && dailyPicks.length > 0) {
            await db.insert(dailyTrends).values({
                date: new Date().toISOString().split('T')[0],
                trendSummary: `Daily trend analysis for ${plan.topic || "General"}`,
                topPicks: dailyPicks,
                sentInEmail: false,
                createdAt: new Date().toISOString()
            });
        }
    });

    // 4. Update Status & Pause for HITL
    // SKIP if trending
    if (mode !== "trending") {
        await step.do("pause-for-approval", async () => {
            const db = getDb(this.env.DB);
            await db.update(researchBriefs)
              .set({ status: "review" }) // schema enum: review
              .where(eq(researchBriefs.id, briefId));
        });
        
        return { status: "paused_for_approval", count: judgedCandidates.length };
    }

    // Explicit end of this workflow execution.
    // Return candidates so index.ts can email them
    return { status: "complete", candidates: judgedCandidates.filter((c: any) => c.judgement.score > 70) };
  }
}
