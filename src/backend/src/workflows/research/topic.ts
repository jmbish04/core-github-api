import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { getDb } from "@/db";
import { researchBriefs, researchCandidates } from "@/db/schemas/github/research";
import { eq } from "drizzle-orm";
import { Logger } from "@/lib/logger";

import { dailyTrends } from "@/db/schemas/github/webhooks";
import { getAgentByName } from 'agents';

type ResearchWorkflowParams = {
  briefId: string;
  plan: any;
  mode?: "standard" | "trending";
};

export class TopicResearchWorkflow extends WorkflowEntrypoint<Env, ResearchWorkflowParams> {
  async run(event: WorkflowEvent<ResearchWorkflowParams>, step: WorkflowStep) {
    const { briefId, plan, mode = "standard" } = event.payload;
    const logger = new Logger(this.env, "TopicResearchWorkflow");
    const logPreface = `[TopicResearchWorkflow - run] `;
    logger.info(`${logPreface}Running workflow for brief: ${briefId}`);
    
    // 1. Discovery (Search)
    const searchResults = await step.do("discovery-search", async () => {
      // Use the WebSearchAgent. We use the briefId as the ID for consistency/caching if we wanted stateful,
      // but WebSearchAgent is largely stateless tool-user.
      const searchAgent = await getAgentByName(this.env.RESEARCH_AGENT as any, briefId) as any;
      logger.info(`${logPreface}Search agent retrieved: ${briefId}`);
      
      const queries: string[] = plan.search_queries || [];
      const allResults: any[] = [];
      logger.info(`${logPreface}Search queries: ${JSON.stringify(queries)}`);
      
      for (const query of queries.slice(0, 3)) { // Limit to top 3 queries to save time/cost
         logger.info(`${logPreface}Searching for query: ${query}`);
         const results = await searchAgent.search(briefId, query);
         allResults.push(...results);
         logger.info(`${logPreface}Search results: ${JSON.stringify(results)}`);
      }
      logger.info(`${logPreface}Search results: ${JSON.stringify(allResults)}`);
      
      return allResults;
    });

    // 2. Judging (Parallel Fan-out)
    const judgedCandidates = await step.do("judge-candidates", async () => {
       const judgeAgent = await getAgentByName(this.env.RESEARCH_AGENT as any, briefId) as any;
       logger.info(`${logPreface}Judge agent retrieved: ${briefId}`);

       const candidatesToJudge = searchResults.slice(0, 15); // Cap at 15
       const criteria = JSON.stringify(plan.goals);
       logger.info(`${logPreface}Candidates to judge: ${JSON.stringify(candidatesToJudge)}`);
       logger.info(`${logPreface}Criteria: ${JSON.stringify(criteria)}`);

       const results = await Promise.all(candidatesToJudge.map(async (candidate: any) => {
         logger.info(`${logPreface}Judging candidate: ${JSON.stringify(candidate)}`);
         const judgement = await judgeAgent.evaluateCandidate(briefId, candidate, criteria);
         logger.info(`${logPreface}Judgement: ${JSON.stringify(judgement)}`);
         return { ...candidate, judgement };
       }));
       logger.info(`${logPreface}Judged candidates: ${JSON.stringify(results)}`);
       return results;
    });

    // 3. Save Candidates & Filter
    await step.do("save-and-filter-candidates", async () => {
        const db = getDb(this.env.DB);
        logger.info(`${logPreface}DB retrieved: ${briefId}`);
        
        // Filter for high quality if trending
        const validCandidates = mode === "trending" 
            ? judgedCandidates.filter((c: any) => c.judgement.score > 70) 
            : judgedCandidates;

        const dailyPicks: any[] = [];

        for (const item of validCandidates) {
            logger.info(`${logPreface}Saving candidate: ${JSON.stringify(item)}`);
            await db.insert(researchCandidates).values({
                briefId,
                sourceId: item.url,
                sourceUrl: item.url,
                sourceType: "other", // Default/fallback
                initialSummary: item.snippet || item.judgement.reasoning,
                judgeScore: item.judgement.score,
                judgeReasoning: item.judgement.reasoning,
                userRating: "pending",
                metadata: item
            });
            logger.info(`${logPreface}Candidate saved: ${JSON.stringify(item)}`);
            if (mode === "trending") {
                dailyPicks.push({
                   name: item.title || "Trending Item",
                   url: item.url,
                   category: plan.topic || "General",
                   why_its_interesting: item.judgement.reasoning,
                   innovation_score: item.judgement.score
                });
                logger.info(`${logPreface}Daily pick added: ${JSON.stringify(item)}`);
            }
        }

        // If trending, save aggregated daily trends
        if (mode === "trending" && dailyPicks.length > 0) {
            logger.info(`${logPreface}Saving daily trends: ${JSON.stringify(dailyPicks)}`);
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
        logger.info(`${logPreface}Pausing for approval`);
        await step.do("pause-for-approval", async () => {
            const db = getDb(this.env.DB);
            await db.update(researchBriefs)
              .set({ status: "review" }) // schema enum: review
              .where(eq(researchBriefs.id, briefId));
            logger.info(`${logPreface}Brief updated to review`);
        });
        logger.info(`${logPreface}Paused for approval`);
        return { status: "paused_for_approval", count: judgedCandidates.length };
    }

    // Explicit end of this workflow execution.
    // Return candidates so index.ts can email them
    logger.info(`${logPreface}Complete, returning candidates`);
    return { status: "complete", candidates: judgedCandidates.filter((c: any) => c.judgement.score > 70) };
  }
}
