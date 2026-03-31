/**
 * @file backend/src/services/stitch/service.ts
 * @description StitchService — wraps Google Stitch MCP tool calls with
 * babysitter monitoring hooks that notify JulesOverseer of session lifecycle.
 *
 * @module Services/Stitch
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentEvent = {
  type: 'agent_message' | 'clarification_request' | 'session_start' | 'session_end';
  sessionId: string;
  content?: string;
  taskId?: string;
  question?: string;
  projectId?: string;
  agentId?: string;
  timestamp?: string;
};

// ---------------------------------------------------------------------------
// StitchService
// ---------------------------------------------------------------------------

/**
 * Service for interacting with Google Stitch MCP tools.
 * Provides a `callWithMonitoring` wrapper that posts session lifecycle events
 * to the JulesOverseer `/ingest` endpoint for babysitter oversight.
 */
export class StitchService {
  private static instance: StitchService;

  private constructor(private readonly env: Env) {}

  /**
   * Returns the singleton StitchService for the current request context.
   */
  public static getInstance(env: Env): StitchService {
    if (!StitchService.instance) {
      StitchService.instance = new StitchService(env);
    }
    return StitchService.instance;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async postEvent(overseerUrl: string, event: AgentEvent): Promise<void> {
    try {
      await fetch(`${overseerUrl}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch (err) {
      console.error('[StitchService] Failed to post event to overseer', err);
    }
  }

  // ---------------------------------------------------------------------------
  // call<T>
  // ---------------------------------------------------------------------------

  /**
   * Executes a raw Stitch tool call.
   * Assumes the Stitch API key is available via env.STITCH_API_KEY.
   *
   * @param toolName - The Stitch tool to invoke.
   * @param args - Arguments to pass to the tool.
   * @returns The parsed JSON response from Stitch.
   */
  async call<T>(toolName: string, args: Record<string, any>): Promise<T> {
    const apiKey =
      typeof this.env.STITCH_API_KEY === 'string'
        ? this.env.STITCH_API_KEY
        : await (this.env.STITCH_API_KEY as any).get();

    const response = await fetch('https://stitch.googleapis.com/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({ tool: toolName, arguments: args }),
    });

    if (!response.ok) {
      throw new Error(`[StitchService] Tool ${toolName} failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // callWithMonitoring<T>
  // ---------------------------------------------------------------------------

  /**
   * Wraps `call<T>` with babysitter monitoring:
   * 1. Posts `session_start` AgentEvent to overseerUrl + '/ingest'
   * 2. Executes the tool call
   * 3. Posts `session_end` AgentEvent (always, even on failure)
   *
   * @param toolName - The Stitch tool to invoke.
   * @param args - Arguments to pass to the tool.
   * @param overseerUrl - Base URL of the JulesOverseer DO endpoint.
   * @returns The tool result.
   */
  async callWithMonitoring<T>(
    toolName: string,
    args: Record<string, any>,
    overseerUrl: string
  ): Promise<T> {
    const sessionId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Post session_start
    await this.postEvent(overseerUrl, {
      type: 'session_start',
      sessionId,
      agentId: 'StitchService',
      content: `Starting Stitch tool: ${toolName}`,
      timestamp,
    });

    try {
      const result = await this.call<T>(toolName, args);

      // Post session_end on success
      await this.postEvent(overseerUrl, {
        type: 'session_end',
        sessionId,
        agentId: 'StitchService',
        content: `Stitch tool ${toolName} completed successfully`,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (err: any) {
      // Post session_end on failure too
      await this.postEvent(overseerUrl, {
        type: 'session_end',
        sessionId,
        agentId: 'StitchService',
        content: `Stitch tool ${toolName} failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      });

      throw err;
    }
  }
}
