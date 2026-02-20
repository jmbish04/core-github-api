import { BaseAgent } from "./BaseAgent";
import { ResearchLogger } from "../../lib/research-logger";
import { getDb } from "@db";
import { resolveDefaultAiProvider, resolveDefaultAiModel } from "@/ai/providers/config";

export class JudgeAgent extends BaseAgent {
  private logger?: ResearchLogger;
  private doState: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.doState = state;
  }

  async evaluateCandidate(briefId: string, candidate: { url: string; content?: string }, criteria: string) {
    const db = getDb(this.env.DB);
    this.logger = new ResearchLogger(db, briefId, null, "JudgeAgent", this.doState);
    
    await this.logger.logInfo("Evaluation", `Judging candidate: ${candidate.url}`);

    // LLM-as-a-Judge
    const resultJson = await this.runTextWithModel({
      name: "ResearchJudge",
      instructions: `You are a critical research judge. evaluate the following content against the research criteria.
      Output strictly valid JSON: { "score": number (0-100), "reasoning": "string", "relevant": boolean }`,
      prompt: `Criteria: ${criteria}\n\nCandidate Content: ${candidate.content?.substring(0, 5000)}...`,
      provider: resolveDefaultAiProvider(this.env),
      model: resolveDefaultAiModel(this.env, resolveDefaultAiProvider(this.env))
    });

    let result = { score: 0, reasoning: "Evaluation failed", relevant: false };
    try {
      const cleanJson = resultJson.replace(/```json\n|\n```/g, "");
      result = JSON.parse(cleanJson);
    } catch (e) {
      await this.logger.logError("Evaluation", e, { raw: resultJson });
    }

    await this.logger.logThought("Evaluation", `Score: ${result.score}. Reasoning: ${result.reasoning}`);
    
    return result;
  }
}
