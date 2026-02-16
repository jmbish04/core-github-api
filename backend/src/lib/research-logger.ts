import { getDb } from "@db";
import { researchExecutionLogs } from "@/db/schemas/github/research";
import { createId } from "@paralleldrive/cuid2";

type Context = ExecutionContext | DurableObjectState;

export class ResearchLogger {
  constructor(
    private db: ReturnType<typeof getDb>,
    private briefId: string | null = null,
    private runId: string | null = null,
    private agentName: string,
    private ctx?: Context
  ) {}

  /**
   * Log a persistent thought or action.
   * Uses ctx.waitUntil pattern to be non-blocking.
   */
  async log(
    level: "info" | "thought" | "tool_input" | "tool_output" | "error",
    content: string,
    metadata?: Record<string, any>
  ) {
    const promise = (async () => {
        try {
            await this.db.insert(researchExecutionLogs).values({
                id: createId(),
                briefId: this.briefId,
                runId: this.runId,
                agentName: this.agentName,
                stepName: level === "thought" ? "reasoning" : "execution",
                logLevel: level,
                content: content.slice(0, 5000), // Safety clip
                metadata: metadata ? JSON.stringify(metadata) : null,
            });
        } catch (error) {
            console.error(`[ResearchLogger] Failed to log: ${error}`);
        }
    })();

    if (this.ctx) {
        this.ctx.waitUntil(promise);
    } else {
        // Fallback to await if no context provided (blocking)
        await promise;
    }
  }

  async logInfo(title: string, message: string, metadata?: any) {
      return this.log("info", `${title}: ${message}`, metadata);
  }

  async logThought(title: string, message: string) {
    return this.log("thought", `${title}: ${message}`);
  }

  async logToolInput(toolName: string, input: any) {
    return this.log("tool_input", `Calling tool: ${toolName}`, { input });
  }

  async logToolOutput(toolName: string, output: any) {
    return this.log("tool_output", `Tool finished: ${toolName}`, { output });
  }

  async logError(title: string, error: any, metadata?: any) {
    return this.log("error", `${title}: ${error?.message || error}`, { ...metadata, error });
  }
}
