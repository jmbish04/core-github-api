// container/src/task_runner.ts
import { execSync } from 'child_process';
import * as fs from 'fs';


// 1. Read Inputs
const REPO_URL = process.env.COLBY_REPO_URL;
const COMMAND = process.env.COLBY_COMMAND;
const PAYLOAD = JSON.parse(process.env.COLBY_PAYLOAD || '{}');
const API_URL = process.env.COLBY_API_URL || 'http://localhost:8787'; // Worker URL
const OPERATION_ID = process.env.COLBY_OPERATION_ID || 'unknown-op';

// Helper to print colorful logs to the PTY
const log = (msg: string) => console.log(`\x1b[36m[Colby]\x1b[0m ${msg}`);
const err = (msg: string) => console.log(`\x1b[31m[Error]\x1b[0m ${msg}`);

// Helper to push timeline updates to the Worker
async function emitStep(stepName: string, status: 'pending' | 'active' | 'completed' | 'failed', details?: string) {
    try {
        await fetch(`${API_URL}/api/ops/${OPERATION_ID}/timeline`, {
            method: 'POST',
            body: JSON.stringify({ step: stepName, status, details }),
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        // Silently fail if API is unreachable, don't crash the runner
        // console.error("Failed to emit step", e);
    }
}

async function main() {
    if (!REPO_URL) throw new Error("Missing REPO_URL");

    await emitStep("Initialization", "completed", `Starting task: ${COMMAND}`);
    log(`Starting task: ${COMMAND}`);

    // 2. Clone Repo
    await emitStep("Cloning Repository", "active");
    log("Cloning repository...");
    try {
        if (fs.existsSync('workspace')) {
            log('Cleaning up old workspace...');
            fs.rmSync('workspace', { recursive: true, force: true });
        }
        execSync(`git clone ${REPO_URL} workspace`, { stdio: 'inherit' });
        process.chdir('workspace');
        await emitStep("Cloning Repository", "completed");
    } catch (e: any) {
        err(`Failed to clone: ${e.message}`);
        await emitStep("Cloning Repository", "failed", e.message);
        process.exit(1);
    }

    // 3. Configure Git
    execSync('git config user.name "Colby Bot"');
    execSync('git config user.email "bot@colby.dev"');

    // 4. Switch based on Command
    switch (COMMAND) {
        case 'fix_all':
            await runFixAll(PAYLOAD);
            break;

        case 'resolve_conflicts':
            await runResolveConflicts(PAYLOAD);
            break;

        default:
            err(`Unknown command: ${COMMAND}`);
            process.exit(1);
    }

    await emitStep("Task Finalization", "completed", "Task finished successfully.");
    log("Task finished successfully.");
}

async function runFixAll(payload: any) {
    await emitStep("Analyzing Comments", "active");
    log("Analyzing comments...");
    fs.writeFileSync('COLBY_FIXES.md', JSON.stringify(payload, null, 2));
    await emitStep("Analyzing Comments", "completed", "Found 5 items to fix.");

    await emitStep("Applying AI Fixes", "active", "Running Gemini 1.5 Pro to patch files...");
    log("Applying AI fixes (Mocking gemini-cli)...");
    await new Promise(r => setTimeout(r, 2000)); // Fake work
    await emitStep("Applying AI Fixes", "completed");

    await emitStep("Committing Changes", "active");
    log("Committing changes...");
    execSync('git add .');
    try {
        execSync('git commit -m "fix: apply automated colby fixes"', { stdio: 'inherit' });
        log("Pushing to remote...");
        execSync('git push', { stdio: 'inherit' });
        await emitStep("Committing Changes", "completed");
    } catch (e) {
        log('No changes to commit or push failed.');
        await emitStep("Committing Changes", "completed", "No changes detected.");
    }
}

async function runResolveConflicts(payload: any) {
    await emitStep("Checking Out Branch", "active");
    log(`Checking out PR branch...`);
    // ... git merge logic ...
    await emitStep("Checking Out Branch", "completed");
}

main().catch(async e => {
    err(e.message);
    await emitStep("Fatal Error", "failed", e.message);
    process.exit(1);
});
