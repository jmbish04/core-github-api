import { createAgent, tool } from '@/ai/agents/honi';
import { z } from 'zod';
import { getSandbox } from '@cloudflare/sandbox';

const agentExports = createAgent<Env>({
    name: 'sandbox-agent',
    model: '@cf/kimi/k2.5',
    system: 'You are a highly capable development assistant responsible for managing a secure, ephemeral Cloudflare Sandbox environment. You can execute code, modify files, run tests, and interact with the filesystem. Remember to act carefully when executing terminal commands or modifying code. Always verify the results.',
    binding: 'SANDBOX_AGENT',
    tools: [
        tool(
            'exec_command',
            'Execute a shell command inside the sandbox',
            {
                command: z.string().describe('The shell command to execute'),
                sessionId: z.string().describe('The identifier for the sandbox session to use')
            },
            async ({ command, sessionId }: { command: string; sessionId: string }, ctx: any) => {
                const sandbox = getSandbox(ctx.env.SANDBOX, sessionId);
                try {
                    const result = await sandbox.exec(command);
                    return { success: result.success, stdout: result.stdout, stderr: result.stderr };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            }
        ),
        tool(
            'read_file',
            'Read the contents of a file inside the sandbox',
            {
                path: z.string().describe('Absolute or relative path to the file to read'),
                sessionId: z.string().describe('The identifier for the sandbox session to use')
            },
            async ({ path, sessionId }: { path: string; sessionId: string }, ctx: any) => {
                const sandbox = getSandbox(ctx.env.SANDBOX, sessionId);
                try {
                    const result = await sandbox.readFile(path);
                    return { content: result.content };
                } catch (error: any) {
                    return { error: error.message };
                }
            }
        ),
        tool(
            'write_file',
            'Write contents to a file inside the sandbox',
            {
                path: z.string().describe('Path to the file to write'),
                content: z.string().describe('The content to write into the file'),
                sessionId: z.string().describe('The identifier for the sandbox session to use')
            },
            async ({ path, content, sessionId }: { path: string; content: string; sessionId: string }, ctx: any) => {
                const sandbox = getSandbox(ctx.env.SANDBOX, sessionId);
                try {
                    await sandbox.writeFile(path, content);
                    return { success: true };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            }
        ),
        tool(
            'git_checkout',
            'Clone a git repository into the sandbox',
            {
                repoUrl: z.string().describe('The https URL of the Git repository'),
                branch: z.string().optional().describe('The branch to checkout'),
                targetDir: z.string().optional().default('repo').describe('The directory to checkout into'),
                sessionId: z.string().describe('The identifier for the sandbox session to use')
            },
            async ({ repoUrl, branch, targetDir, sessionId }: { repoUrl: string; branch?: string; targetDir?: string; sessionId: string }, ctx: any) => {
                const sandbox = getSandbox(ctx.env.SANDBOX, sessionId);
                try {
                    let cloneUrl = repoUrl;
                    if (ctx.env.GITHUB_PERSONAL_ACCESS_TOKEN && cloneUrl.includes('github.com')) {
                        cloneUrl = cloneUrl.replace('https://', `https://${ctx.env.GITHUB_PERSONAL_ACCESS_TOKEN}@`);
                    }

                    await sandbox.gitCheckout(cloneUrl, {
                        ...(branch && { branch }),
                        depth: 1,
                        targetDir: targetDir ?? 'repo'
                    });
                    
                    return { success: true, message: `Checked out into ${targetDir ?? 'repo'}` };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            }
        ),
        tool(
            'destroy_sandbox',
            'Destroy and cleanup the current sandbox environment',
            {
                sessionId: z.string().describe('The identifier for the sandbox session to use')
            },
            async ({ sessionId }: { sessionId: string }, ctx: any) => {
                const sandbox = getSandbox(ctx.env.SANDBOX, sessionId);
                try {
                    await sandbox.destroy();
                    return { success: true, message: "Sandbox destroyed" };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            }
        )
    ]
});

export const SandboxAgent = agentExports.Agent;
export default agentExports.handler;
