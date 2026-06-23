import type { ResearchFinding } from "../types";
import type { ResearchAgent } from "../index";
import { Logger } from "@/lib/logger";

/**
 * Deep dive into a topic using AI-powered analysis.
 * The AI synthesizes knowledge from its training data and any
 * available context to produce comprehensive findings.
 */
export async function deepDive(
  agent: ResearchAgent,
  topic: string,
  context?: string,
): Promise<{ findings: ResearchFinding[]; summary: string }> {
  try {
    const prompt = `You are a Research Agent performing a deep dive on the following topic.

Topic: ${topic}
${context ? `\nAdditional Context: ${context}` : ""}

Analyze this topic thoroughly and provide:
1. Key findings with supporting evidence
2. A comprehensive summary
3. Confidence level (0-100)

Format your response as JSON with fields:
- findings: array of { title, content, relevanceScore (0-1) }
- summary: string
- confidence: number`;

    const result = await (agent as any).ai.generateText(prompt, undefined, { skills: ['deep-research', 'brainstorming', 'source-evaluation'] });

    try {
      const parsed = JSON.parse(result);
      return {
        findings: (parsed.findings || []).map((f: any) => ({
          source: "mixed" as const,
          title: f.title || "",
          content: f.content || "",
          relevanceScore: f.relevanceScore || 0.5,
        })),
        summary: parsed.summary || result,
      };
    } catch {
      return {
        findings: [{
          source: "mixed",
          title: topic,
          content: result,
          relevanceScore: 0.7,
        }],
        summary: result.slice(0, 500),
      };
    }
  } catch (err) {
    const logger = new Logger((agent as any).env, "ResearchAgent");
    logger.error("AI research failed:", { error: String(err) });
    return {
      findings: [],
      summary: `Research failed for topic: ${topic}`,
    };
  }
}
