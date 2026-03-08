import { drizzle } from 'drizzle-orm/d1';
import { systemLogs } from '@db/schema';
import { generateUuid } from "@/utils/common";

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export class Logger {
  private logs: Array<typeof systemLogs.$inferInsert> = [];

  constructor(private env: Env, private sourceOverride?: string) {}

  private getTrace() {
    try {
      throw new Error();
    } catch (e: any) {
      // Stack format: "Error\n at Logger.getTrace (src/lib/logger.ts:12:13)\n at Logger.log (src/lib/logger.ts:25:22)..."
      // We want the caller of log(), so usually index 3 or 4 depending on environment.
      const stack = e.stack?.split('\n') || [];
      // Finding the first line that is NOT logger.ts
      const callerLine = stack.find((line: string) => line.includes('at ') && !line.includes('logger.ts'));
      
      if (!callerLine) return { file: 'unknown', line: 0 };

      // Parse "at FunctionName (src/path/file.ts:12:34)" or "at src/path/file.ts:12:34"
      const match = callerLine.match(/\((.*):(\d+):\d+\)/) || callerLine.match(/at (.*):(\d+):\d+/);
      if (match) {
        return { file: match[1], line: parseInt(match[2]) };
      }
      return { file: callerLine.trim(), line: 0 };
    }
  }

  log(level: LogLevel, message: string, meta?: any) {
    const trace = this.getTrace();
    const file = this.sourceOverride || trace.file;
    const timestamp = new Date();

    // Console output for observability (JSON structured)
    console.log(JSON.stringify({
      level,
      message,
      meta,
      source: `${file}:${trace.line}`,
      timestamp: timestamp.toISOString()
    }));

    // Buffer for D1
    this.logs.push({
      id: generateUuid(),
      level,
      message,
      meta: meta ? JSON.stringify(meta) : null,
      sourceFile: file,
      lineNumber: trace.line,
      timestamp
    });
  }

  info(message: string, meta?: any) { this.log('info', message, meta); }
  warn(message: string, meta?: any) { this.log('warn', message, meta); }
  error(message: string, meta?: any) { this.log('error', message, meta); }
  debug(message: string, meta?: any) { this.log('debug', message, meta); }

  /**
   * Flushes buffered logs to D1.
   * Should be called at the end of execution (e.g., finally block in workflow).
   */
  async flush() {
    if (this.logs.length === 0) return;
    
    try {
      const db = drizzle(this.env.DB);
      // Insert in batches if necessary, typically small for single workflow step
      await db.insert(systemLogs).values(this.logs).execute();
      this.logs = []; // Clear buffer
    } catch (e) {
      console.error("Failed to flush logs to D1", e);
    }
  }
}
