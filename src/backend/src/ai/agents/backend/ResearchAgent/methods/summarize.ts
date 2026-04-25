import type { ResearchAgent } from "../index";


import { z } from "zod";

/**
 * Summarize research content into a concise, structured output.
 * Uses AIProvider for intelligent summarization with key points extraction.
 */
export async function summarize(
  agent: ResearchAgent,
  content: string,
  maxLength: number = 500,
): Promise<{ summary: string; keyPoints: string[] }> {
  const logger = agent.getLogger();
  const logPrefix = "[ResearchAgent - summarize]";
  logger.info(`${logPrefix} Summarizing content: ${content}`);
  try {
    const prompt = `Summarize the following content in at most ${maxLength} characters. Extract 3-5 key bullet points.

Content:
${content}`;
    logger.info(`${logPrefix} Generated prompt: ${prompt}`);

    const schema = z.object({
      summary: z.string(),
      keyPoints: z.array(z.string()),
    });

    const result = await agent.getAI().generateStructuredResponse(
      prompt,
      schema,
      undefined,
      { provider: "jules", skills: ['deep-research', 'brainstorming', 'source-evaluation'] }
    );
    
    logger.info(`${logPrefix} Parsed result: ${JSON.stringify(result)}`);
    return {
      summary: result.summary.slice(0, maxLength),
      keyPoints: result.keyPoints
    };
  } catch (err) {
    logger.error(`${logPrefix} AI summarization failed:`, { error: String(err) });
    return {
      summary: content.slice(0, maxLength),
      keyPoints: [],
    };
  }
}
