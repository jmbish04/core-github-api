
interface ProcessInfo {
    user: string;
    pid: string;
    command: string;
    cpu: string;
    mem: string;
    time: string;
}

export class SandboxToolRegistry {
    constructor(private supervisorStub: DurableObjectStub) { }

    /**
     * Diagnostic Tool: Check what is actually running inside the container.
     * Essential for detecting stuck 'npm install' or 'git' processes.
     */
    async listRunningProcesses(): Promise<ProcessInfo[]> {
        const res = await this.supervisorStub.fetch("http://do/ps");
        if (!res.ok) throw new Error("Failed to list processes");
        const data = await res.json() as any;
        return data.processes;
    }

    /**
     * Intervention Tool: Kill a specific stuck process.
     */
    async killStuckProcess(processId: string) {
        // 1. In a real scenario, we might peek logs, but node-pty streams generally handles main output.
        // We could implement a 'proc_logs' endpoint if we could attach to specific PIDs, but usually we just see main PTY.

        // 2. Kill it
        const res = await this.supervisorStub.fetch("http://do/kill-process", {
            method: "POST",
            body: JSON.stringify({ pid: processId })
        });

        return {
            action: "killed",
            status: res.status,
            result: await res.json()
        };
    }

    /**
     * Safe Execution Tool: Runs a command with built-in "Vibe Check"
     */
    async executeSmart(command: string) {
        // 1. Run the command
        const res = await this.supervisorStub.fetch("http://do/exec", {
            method: "POST",
            body: JSON.stringify({ command, timeout: 30000 })
        });

        const result = await res.json() as any;

        // 2. Analyze the result
        if (result.exitCode !== 0) {
            // Automatic "Self-Healing" logic could go here
            if (result.stderr && result.stderr.includes("package-lock.json found")) {
                return {
                    success: false,
                    error: "Lockfile conflict",
                    suggestion: "Try running with --no-package-lock or delete the lockfile first."
                };
            }

            return { success: false, error: result.stderr, code: result.exitCode };
        }

        return { success: true, output: result.stdout };
    }
}
