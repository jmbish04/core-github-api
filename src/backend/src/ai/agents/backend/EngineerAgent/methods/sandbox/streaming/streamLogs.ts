/**
 * @file EngineerAgent/methods/sandbox/streaming/streamLogs.ts
 * @description Streams sandbox process output (stdout/stderr) to the assistant-ui frontend
 *              using an async generator pattern compatible with Cloudflare Workers SSE.
 *
 * @pattern Async Generator → ReadableStream → SSE Response
 * @usage
 *   const stream = streamLogs(deps, sessionId, { logFile: "/tmp/spawn-abc.log" });
 *   return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { StreamLogsOptions } from "./types";

// ── Async Generator ───────────────────────────────────────────────────────────

/**
 * Yields log lines incrementally as they appear in the sandbox log file.
 * Terminates when maxIdlePolls consecutive polls return no new content.
 */
export async function* streamLogsGenerator(
  env: Env,
  sessionId: string,
  options: StreamLogsOptions
): AsyncGenerator<string> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - streamLogs:");
  const loggerPrefix = `[SandboxSDK - streamLogs - ${sessionId}]`;

  const { logFile, intervalMs = 500, maxIdlePolls = 20 } = options;
  let lastByteOffset = 0;
  let idlePolls = 0;

  logger.info(`${loggerPrefix} Starting log stream for ${logFile}`);

  while (idlePolls < maxIdlePolls) {
    try {
      // Read only new bytes since last poll using tail + byte offset
      const result = await sandbox.exec(
        `tail -c +${lastByteOffset + 1} "${logFile}" 2>/dev/null`
      );
      const newContent = result.stdout ?? "";

      if (newContent.length > 0) {
        lastByteOffset += new TextEncoder().encode(newContent).length;
        idlePolls = 0;

        // Yield each line as an SSE-formatted data event
        for (const line of newContent.split("\n")) {
          if (line.trim()) {
            yield `data: ${JSON.stringify({ line, sessionId, timestamp: Date.now() })}\n\n`;
          }
        }
      } else {
        idlePolls++;
      }
    } catch {
      idlePolls++;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  logger.info(`${loggerPrefix} Stream ended after ${maxIdlePolls} idle polls`);
  yield `data: ${JSON.stringify({ done: true, sessionId })}\n\n`;
}

// ── ReadableStream Adapter ────────────────────────────────────────────────────

/**
 * Wraps the async generator into a WHATWG ReadableStream for direct use
 * as a Cloudflare Worker SSE response body.
 *
 * @example
 *   return new Response(streamLogs(deps, sessionId, opts), {
 *     headers: {
 *       "Content-Type":  "text/event-stream",
 *       "Cache-Control": "no-cache",
 *       "Connection":    "keep-alive",
 *     },
 *   });
 */
export function streamLogs(
  env: Env,
  sessionId: string,
  options: StreamLogsOptions
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const gen = streamLogsGenerator(env, sessionId, options);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await gen.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(encoder.encode(value));
      }
    },
    cancel() {
      gen.return(undefined);
    },
  });
}
