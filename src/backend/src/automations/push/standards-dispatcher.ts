import { Octokit } from '@octokit/rest';
import { withCompatOctokit } from '@/services/octokit/compat';
import { generateText } from '@/ai/providers';
import { buildCodingAgentInstructions } from '@/services/golden-path-config';
import { JulesService } from '@/services/jules/service';
import type { AutomationRunnerPolicyRow } from '@/db/schemas/app/automation_runner_policies';

export interface PushStandardsRepository {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  description?: string | null;
  infrastructure?: string | null;
}

export interface PushStandardsPayload {
  ref: string;
  after: string;
}

export interface StandardsDispatchInput {
  env: Env;
  appOctokit: any;
  patToken?: string;
  policy: AutomationRunnerPolicyRow;
  repository: PushStandardsRepository;
  payload: PushStandardsPayload;
}

interface CommitContext {
  sha: string;
  changedFiles: Array<{
    path: string;
    patch: string;
  }>;
}

function buildRepositoryUrl(repository: PushStandardsRepository): string {
  return `https://github.com/${repository.owner}/${repository.name}`;
}

async function createPatClient(token: string): Promise<any> {
  return withCompatOctokit(new Octokit({ auth: token }));
}

async function getCommitContext(
  octokit: any,
  repository: PushStandardsRepository,
  sha: string,
): Promise<CommitContext> {
  const { data } = await octokit.rest.repos.getCommit({
    owner: repository.owner,
    repo: repository.name,
    ref: sha,
  });

  const changedFiles = (data.files || [])
    .filter((file: any) => file.filename)
    .slice(0, 8)
    .map((file: any) => ({
      path: file.filename,
      patch: String(file.patch || '').slice(0, 3000),
    }));

  return {
    sha: data.sha,
    changedFiles,
  };
}

function formatChangedFiles(context: CommitContext): string {
  if (!context.changedFiles.length) {
    return 'No changed files were included in the webhook payload.';
  }

  return context.changedFiles
    .map((file) => {
      const header = `File: ${file.path}`;
      if (!file.patch) {
        return `${header}\nPatch: unavailable`;
      }

      return `${header}\nPatch:\n${file.patch}`;
    })
    .join('\n\n---\n\n');
}

async function postCommitComment(
  octokit: any,
  repository: PushStandardsRepository,
  sha: string,
  body: string,
): Promise<void> {
  await octokit.rest.repos.createCommitComment({
    owner: repository.owner,
    repo: repository.name,
    commit_sha: sha,
    body,
  });
}

async function dispatchInternalAgent(
  input: StandardsDispatchInput,
  commitContext: CommitContext,
): Promise<string> {
  const standards = await buildCodingAgentInstructions(input.env);
  const systemPrompt = [
    'You are a repository standards auditor operating on a Cloudflare Worker codebase.',
    'Review the pushed changes against the provided standards and return concise markdown only.',
    'Focus on standards drift, high-risk regressions, missing sync assets, and concrete next steps.',
  ].join(' ');

  const prompt = [
    `Repository: ${input.repository.fullName}`,
    `Repository URL: ${buildRepositoryUrl(input.repository)}`,
    `Default branch: ${input.repository.defaultBranch}`,
    `Infrastructure: ${input.repository.infrastructure || 'unknown'}`,
    `Commit: ${commitContext.sha}`,
    '',
    'Golden path standards:',
    standards || 'No dynamic standards were configured.',
    '',
    'Changed files:',
    formatChangedFiles(commitContext),
  ].join('\n');

  const analysis = await generateText(
    input.env,
    prompt,
    systemPrompt,
    {
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      maxTokens: 1400,
      temperature: 0.1,
    },
    'worker-ai',
  );

  const body = [
    '## Automated Standards Check',
    '',
    `Runner: internal_agent`,
    `Branch: ${input.repository.defaultBranch}`,
    `Commit: \`${commitContext.sha.slice(0, 7)}\``,
    '',
    analysis.trim(),
  ].join('\n');

  await postCommitComment(input.appOctokit, input.repository, commitContext.sha, body);
  return 'Posted internal-agent standards analysis to the pushed commit.';
}

async function dispatchJules(
  input: StandardsDispatchInput,
  commitContext: CommitContext,
): Promise<string> {
  const standards = await buildCodingAgentInstructions(input.env);
  const prompt = [
    `New push detected for ${input.repository.fullName}.`,
    `Branch: ${input.repository.defaultBranch}`,
    `Commit: ${commitContext.sha}`,
    '',
    'Analyze the pushed changes for standards compliance and repository hygiene.',
    '',
    standards,
    '',
    'Changed files:',
    formatChangedFiles(commitContext),
  ].join('\n');

  const jules = JulesService.getInstance(input.env);
  await jules.startSession({
    prompt,
    repo: {
      owner: input.repository.owner,
      repo: input.repository.name,
      branch: input.repository.defaultBranch,
    },
  });

  return 'Queued Jules standards analysis for the push.';
}

async function dispatchGithubAssignment(
  input: StandardsDispatchInput,
  commitContext: CommitContext,
): Promise<string> {
  if (!input.patToken) {
    throw new Error('PAT token is required for github_assignment runner policies.');
  }

  const patOctokit = await createPatClient(input.patToken);
  const assignmentTarget = input.policy.targetRef || '@codex[agent]';
  const body = [
    `${assignmentTarget} analyze this default-branch push for standards compliance.`,
    '',
    `Repository: ${input.repository.fullName}`,
    `Branch: ${input.repository.defaultBranch}`,
    `Commit: ${commitContext.sha}`,
    `Infrastructure: ${input.repository.infrastructure || 'unknown'}`,
    '',
    'Focus on standards drift, missing sync assets, repository hygiene, and Cloudflare compatibility.',
  ].join('\n');

  await postCommitComment(patOctokit, input.repository, commitContext.sha, body);
  return `Posted standards assignment for ${assignmentTarget}.`;
}

export async function dispatchStandardsCheck(
  input: StandardsDispatchInput,
): Promise<string> {
  const commitContext = await getCommitContext(input.appOctokit, input.repository, input.payload.after);

  switch (input.policy.runnerKind) {
    case 'internal_agent':
      return dispatchInternalAgent(input, commitContext);
    case 'jules':
      return dispatchJules(input, commitContext);
    case 'github_assignment':
      return dispatchGithubAssignment(input, commitContext);
    default:
      throw new Error(`Unsupported runner kind: ${input.policy.runnerKind}`);
  }
}
