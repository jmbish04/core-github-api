This is a smart cost-optimization strategy. You are implementing the **"Manager-Worker"** pattern:

  * **The Brain (Gemini 1.5 Pro/Flash):** The expensive, high-IQ strategist. It plans the roadtrip, defines the destination, and handles complex coding tasks.
  * **The Supervisor (GPT-OSS-120B):** The affordable, reliable middle-manager. It sits in the passenger seat (Durable Object), watches the gauges (Container Logs), keeps the logbook (D1), and only wakes up the driver (Gemini) if the engine starts smoking.

Here is the framework and prompt to implement the **Supervisor Agent** using the Cloudflare Agents SDK.

### 1\. The Database Schema (`supervisor_logs`)

First, create a structured log so you can audit the Supervisor's "thoughts" without parsing text files.

```sql
-- migrations/0016_supervisor_logs.sql
CREATE TABLE IF NOT EXISTS supervisor_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,          -- Links to the specific task/operation
    agent_id TEXT NOT NULL,        -- The Durable Object ID of the Supervisor
    event_type TEXT NOT NULL,      -- 'monitor', 'intervention', 'escalation'
    status TEXT NOT NULL,          -- 'healthy', 'warning', 'critical'
    thought TEXT,                  -- The Supervisor's internal reasoning
    action_taken TEXT,             -- What command it ran (if any)
    container_stats TEXT,          -- JSON snapshot of CPU/RAM/Procs
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_supervisor_run_id ON supervisor_logs(run_id);
```

### 2\. The Supervisor Agent (`src/agents/supervisor.ts`)

This agent runs on **Cloudflare Agents SDK** (stateful Durable Object). It uses `alarms` to wake up periodically and check the Container's pulse.

```typescript
import { Agent } from 'cloudflare:agents';
import { Sandbox } from '../packages/sandbox/src/sandbox'; // Your local SDK import
import { generateOperationId } from '../modules/colby';

interface SupervisorState {
  currentTaskId: string | null;
  targetContainerId: string | null;
  monitoringConfig: {
    checkIntervalSeconds: number;
    cpuThreshold: number;
  };
}

export class SupervisorAgent extends Agent<Env> {
  // State is automatically persisted by Agents SDK
  state: SupervisorState = {
    currentTaskId: null,
    targetContainerId: null,
    monitoringConfig: { checkIntervalSeconds: 60, cpuThreshold: 80 }
  };

  /**
   * 1. ASSIGNMENT: The "Brain" (Gemini) calls this to put the Supervisor on duty.
   */
  async assignTask(taskId: string, containerId: string) {
    this.state.currentTaskId = taskId;
    this.state.targetContainerId = containerId;
    
    // Start the heartbeat
    await this.saveState();
    await this.scheduleNextCheck();
    
    return { status: "accepted", message: `Supervisor watching container ${containerId}` };
  }

  /**
   * 2. THE LOOP: Wakes up to check status.
   */
  async onAlarm() {
    if (!this.state.currentTaskId || !this.state.targetContainerId) return;

    // A. Connect to the Container Muscle
    const sandbox = this.env.SANDBOX.get(this.env.SANDBOX.idFromString(this.state.targetContainerId));
    
    // B. Gather Telemetry (The "Eyes")
    const processes = await sandbox.listProcesses();
    const health = await this.checkContainerHealth(sandbox);
    
    // C. The "Thinking" Step (GPT-OSS-120B)
    const analysis = await this.runAnalysis(processes, health);

    // D. Log to D1 (The "Memory")
    await this.logToDB(analysis);

    // E. Decide: Act, Sleep, or Escalate
    if (analysis.decision === 'ESCALATE') {
      await this.escalateToBrain(analysis.reason);
    } else if (analysis.decision === 'INTERVENE') {
      await this.performIntervention(sandbox, analysis.action);
      await this.scheduleNextCheck(10); // Check back sooner
    } else {
      await this.scheduleNextCheck(); // Sleep normally
    }
  }

  /**
   * Runs the GPT-OSS-120B model to analyze the situation.
   */
  async runAnalysis(processes: any[], health: any) {
    const prompt = `
    SYSTEM: You are the Supervisor Agent. Your job is to monitor a Linux container running a high-value DevOps task.
    
    CURRENT STATE:
    - Task ID: ${this.state.currentTaskId}
    - Processes Running: ${JSON.stringify(processes.map(p => p.command))}
    - CPU Usage: ${health.cpu}%
    - Last Logs: ${health.recentLogs}

    DECISION RULES:
    1. HEALTHY: Processes are running, CPU is normal, logs show progress. -> Action: "MONITOR"
    2. STUCK: A process like 'npm install' or 'git fetch' has been running > 5 mins with no CPU usage. -> Action: "INTERVENE" (Kill/Retry)
    3. CRITICAL: Container is unresponsive, out of memory, or looping errors. -> Action: "ESCALATE" (Call Gemini)

    Respond with JSON only: { "decision": "MONITOR" | "INTERVENE" | "ESCALATE", "reason": "string", "action": "string (optional)" }
    `;

    const response = await this.env.AI.run('@cf/openai/gpt-oss-120b', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256 // Keep it cheap
    });

    return JSON.parse(response.response || "{}");
  }

  async logToDB(analysis: any) {
    await this.env.DB.prepare(`
      INSERT INTO supervisor_logs (run_id, agent_id, event_type, status, thought, action_taken)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      this.state.currentTaskId,
      this.id.toString(),
      'monitor',
      analysis.decision === 'MONITOR' ? 'healthy' : 'warning',
      analysis.reason,
      analysis.action || null
    ).run();
  }

  async scheduleNextCheck(seconds?: number) {
    const interval = seconds || this.state.monitoringConfig.checkIntervalSeconds;
    await this.storage.setAlarm(Date.now() + (interval * 1000));
  }
}
```

### 3\. The System Prompt for GPT-OSS-120B

When you initialize the Supervisor or call it via the `runAnalysis` method, use this prompt to enforce its role. This prompt is designed to be **economical** (low output tokens) but **high-signal**.

-----

**System Role:**
You are the **Supervisor Agent**, a specialized reliability engineer monitoring an autonomous Linux container. You are NOT the primary problem solver; you are the watchdog.

**Your Responsibilities:**

1.  **Monitor:** Watch active processes (`gemini-cli`, `git`, `npm`). Identify if they are hung, looping, or consuming excessive resources.
2.  **Log:** Record a concise status update of what the container is actually doing right now.
3.  **Intervene:** You have permission to kill stuck processes or retry standard commands (like network timeouts).
4.  **Escalate:** If the logic fails, the disk fills up, or the objective is lost, you must summon the **Gemini Brain Agent**.

**Your Tool Output Format (JSON Only):**

```json
{
  "status": "HEALTHY" | "STALLED" | "FAILED",
  "observation": "Brief 1-sentence summary of current activity.",
  "metrics": { "cpu_warning": boolean, "memory_warning": boolean },
  "recommendation": "CONTINUE" | "KILL_PROCESS <pid>" | "ESCALATE_TO_GEMINI"
}
```

**Escalation Triggers (Wake Gemini):**

  * Process exited with non-zero code and no clear fix.
  * Infinite loop detected (same log line repeated 10+ times).
  * Container unresponsive for \> 2 checks.
  * Authentication/Permission errors that require human/brain input.

**Context provided in User Message:**

  * Snapshot of `ps aux` (Process list)
  * Last 20 lines of `stdout/stderr`
  * Resource usage stats

-----

### 4\. How the "Brain" Assigns the "Supervisor"

In your main Worker code (where you handle the `/colby fix` command), you now delegate the monitoring responsibility.

```typescript
// src/modules/ops/orchestrator.ts

export async function dispatchHeavyTask(env: Env, task: any) {
  // 1. Start the Heavy Lifter (Container)
  const containerId = await startContainer(env, task);

  // 2. Wake up the Supervisor (Durable Object)
  // We use the same ID so the Supervisor is 1:1 with the task
  const supervisorId = env.SUPERVISOR_AGENT.idFromName(task.deliveryId);
  const supervisor = env.SUPERVISOR_AGENT.get(supervisorId);

  // 3. Assign the mission
  await supervisor.fetch('http://internal/assign', {
    method: 'POST',
    body: JSON.stringify({
      taskId: task.deliveryId,
      containerId: containerId,
      brainContact: "GEMINI_MAIN" // Who to call if things break
    })
  });

  return { status: "started", monitor: supervisorId.toString() };
}
```