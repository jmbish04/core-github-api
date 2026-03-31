/**
 * src/backend/src/lib/logger.ts
 * CORE LOGGING SYSTEM: Handles D1 buffering, source tracing, and secret masking.
 */
import { getDb } from '@db';
import { systemLogs } from '@db/schema';
import { generateUuid } from "@/utils/common";

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export class Logger {
  private logs: Array<typeof systemLogs.$inferInsert> = [];
  // Regex to identify sensitive keys in metadata objects
  private readonly SECRET_KEYS = /key|token|secret|password|auth|credential/i;

  constructor(private env: Env, private sourceOverride?: string) {}

  /**
   * Internal trace to find the calling file and line.
   */
  private getTrace() {
    try {
      throw new Error();
    } catch (e: any) {
      const stack = e.stack?.split('\n') || [];
      const callerLine = stack.find((line: string) => 
        line.includes('at ') && !line.includes('logger.ts') && !line.includes('anonymous')
      );
      
      if (!callerLine) return { file: 'unknown', line: 0 };

      const match = callerLine.match(/\((.*):(\d+):\d+\)/) || callerLine.match(/at (.*):(\d+):\d+/);
      if (match) {
        return { file: match[1], line: parseInt(match[2]) };
      }
      return { file: callerLine.trim(), line: 0 };
    }
  }

  /**
   * Synchronous utility for masking strings.
   * Logic: Keeps first 8 and last 4 chars for better provider identification (e.g., sk-ant-...).
   */
  mask(value: string | null | undefined): string {
    if (!value) return "N/A";
    if (value.length <= 12) return "********";
    return `${value.slice(0, 8)}...${value.slice(-4)}`;
  }

  /**
   * Deeply scans an object and masks sensitive keys.
   */
  private sanitize(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sanitize(item));

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.SECRET_KEYS.test(key) && typeof value === 'string') {
        sanitized[key] = this.mask(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  log(level: LogLevel, message: string, meta?: any) {
    const trace = this.getTrace();
    const file = this.sourceOverride || trace.file;
    const timestamp = new Date();
    
    // Auto-sanitize the metadata to prevent accidental leaks in D1 or Console
    const cleanMeta = this.sanitize(meta);

    console.log(JSON.stringify({
      level,
      message,
      meta: cleanMeta,
      source: `${file}:${trace.line}`,
      timestamp: timestamp.toISOString()
    }));

    this.logs.push({
      id: generateUuid(),
      level,
      message,
      meta: cleanMeta ? JSON.stringify(cleanMeta) : null,
      sourceFile: file,
      lineNumber: trace.line,
      timestamp
    });
  }

  info(message: string, meta?: any) { this.log('info', message, meta); }
  warn(message: string, meta?: any) { this.log('warn', message, meta); }
  error(message: string, meta?: any) { this.log('error', message, meta); }
  debug(message: string, meta?: any) { this.log('debug', message, meta); }

  async flush() {
    if (this.logs.length === 0) return;
    try {
      const db = getDb(this.env.DB);
      await db.insert(systemLogs).values(this.logs).execute();
      this.logs = [];
    } catch (e) {
      console.error("Critical: Failed to flush logs to D1", e);
    }
  }
}