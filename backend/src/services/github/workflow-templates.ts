import agentDocstringsWorkflow from '@/automations/push/orchestration/sync/.github/workflows/agent-docstrings.yaml';
import automationMaintainerWorkflow from '@/automations/push/orchestration/sync/.github/workflows/automation-maintainer.yaml';
import autoApplyGeminiWorkflow from '@/automations/push/orchestration/sync/.github/workflows/auto-apply-gemini.yaml';
import deployWorkerWorkflow from '@/automations/push/orchestration/sync/.github/workflows/deploy-worker.yaml';
import prCommentExtractorWorkflow from '@/automations/push/orchestration/sync/.github/workflows/pr-comment-extractor.yaml';

export interface WorkflowTemplate {
  path: string;
  content: string;
}

export const PR_COMMENT_EXTRACTOR_WORKFLOW = prCommentExtractorWorkflow;
export const CLOUDFLARE_DEPLOY_WORKFLOW = deployWorkerWorkflow;
export const AUTO_APPLY_GEMINI_WORKFLOW = autoApplyGeminiWorkflow;
export const AGENT_DOCSTRINGS_WORKFLOW = agentDocstringsWorkflow;
export const AUTOMATION_MAINTAINER_WORKFLOW = automationMaintainerWorkflow;

export const DEFAULT_WORKFLOWS: WorkflowTemplate[] = [
  {
    path: '.github/workflows/pr-comment-extractor.yaml',
    content: PR_COMMENT_EXTRACTOR_WORKFLOW,
  },
  {
    path: '.github/workflows/deploy-worker.yaml',
    content: CLOUDFLARE_DEPLOY_WORKFLOW,
  },
  {
    path: '.github/workflows/auto-apply-gemini.yaml',
    content: AUTO_APPLY_GEMINI_WORKFLOW,
  },
  {
    path: '.github/workflows/agent-docstrings.yaml',
    content: AGENT_DOCSTRINGS_WORKFLOW,
  },
  {
    path: '.github/workflows/automation-maintainer.yaml',
    content: AUTOMATION_MAINTAINER_WORKFLOW,
  },
];

export function shouldIncludeCloudflareWorkflow(files: string[]): boolean {
  return files.some(
    (file) =>
      file.endsWith('wrangler.toml') ||
      file.endsWith('wrangler.json') ||
      file.endsWith('wrangler.jsonc'),
  );
}
