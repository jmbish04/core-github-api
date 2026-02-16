import { BaseAgent } from "./BaseAgent";
import { getDb } from "@db";
import { researchBriefs, researchPlans, researchCandidates } from "../../db/schemas/github/research";
import { ResearchLogger } from "../../lib/research-logger";
import { eq } from "drizzle-orm";

type AgentState = {
  briefId?: string;
  status: "idle" | "planning" | "researching" | "review" | "complete";
};

// Actually I'll do two chunks.

export class TopicOrchestratorAgent extends BaseAgent<AgentState> {
  private logger?: ResearchLogger;
  private doState: DurableObjectState; // Store DO state explicitly

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.doState = state; // Capture it
    // Logger initialized in methods where we have briefId context
  }

  // --- Public Methods (RPC) ---

  async submitBrief(userId: string, title: string, content: any) {
    const db = getDb(this.env.DB);
    
    // Create new brief
    const [brief] = await db.insert(researchBriefs).values({
      userId,
      title,
      rawBriefContent: JSON.stringify(content),
      status: "planning",
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    this.setState({ briefId: brief.id, status: "planning" });
    
    // Initialize logger
    this.logger = new ResearchLogger(db, brief.id, null, "TopicOrchestrator", this.doState); // Use explicit DO state
    await this.logger.logInfo("Lifecycle", `Brief created: ${title}`, { briefId: brief.id });
    
    // Trigger initial planning
    await this.formulatePlan(brief.id, content);
    
    return brief;
  }

  async getStatus() {
    return this.state; // Refers to TState
  }

  // --- Internal Logic ---

  private async formulatePlan(briefId: string, content: any) {
    if (!this.logger) return; // Should be inited
    
    await this.logger.logThought("Planning", "Analyzing user brief to generate research plan...");
    
    const db = getDb(this.env.DB);
    
    // Use AI to generate a plan
    const planJson = await this.runTextWithModel({
      name: "ResearchPlanner",
      instructions: `You are an expert Research Planner. 
      Analyze the user request and create a list of specific research questions and Google search queries.
      Output strictly valid JSON: { "goals": [], "search_queries": [], "required_sources": [] }`,
      prompt: JSON.stringify(content),
    });
    
    let plan = {};
    try {
      // Clean potential markdown blocks
      const cleanJson = planJson.replace(/```json\n|\n```/g, "");
      plan = JSON.parse(cleanJson);
    } catch (e) {
      await this.logger.logError("Planning", e);
      plan = { error: "Failed to parse plan", raw: planJson };
    }

    // Save plan
    await db.insert(researchPlans).values({
      briefId,
      currentVersion: JSON.stringify(plan),
      isApproved: false,
    });
    
    await this.logger.logInfo("Planning", "Plan generated and saved.", { plan });
  }
}
