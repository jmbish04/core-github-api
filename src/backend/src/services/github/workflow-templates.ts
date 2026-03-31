export interface WorkflowTemplate {
  path: string;
  content: string;
}

const generateProxyWorkflow = (
  repoStandard: string,
  name: string,
  filename: string,
  triggers: string = "on:\\n  push:\\n    branches: [main]\\n  pull_request:\\n    branches: [main]",
) =>
  `name: ${name}\\n\\n${triggers}\\n\\njobs:\\n  ${filename.replace('.yaml', '')}:\\n    uses: ${repoStandard}/.github/workflows/${filename}@main\\n    secrets: inherit\\n`;

export function makeWorkflowTemplates(repoStandard: string): WorkflowTemplate[] {
  return [
    {
      path: '.github/workflows/pr-comment-extractor.yaml',
      content: generateProxyWorkflow(
        repoStandard,
        'PR Comment Extractor',
        'pr-comment-extractor.yaml',
        "on:\\n  issue_comment:\\n    types: [created]",
      ),
    },
    {
      path: '.github/workflows/deploy-worker.yaml',
      content: generateProxyWorkflow(repoStandard, 'Deploy Worker', 'deploy-worker.yaml'),
    },
    {
      path: '.github/workflows/auto-apply-gemini.yaml',
      content: generateProxyWorkflow(
        repoStandard,
        'Auto-Apply Gemini Suggestions',
        'auto-apply-gemini.yaml',
        "on:\\n  pull_request_review_comment:\\n    types: [created]",
      ),
    },
    {
      path: '.github/workflows/agent-docstrings.yaml',
      content: generateProxyWorkflow(repoStandard, 'Agent Docstrings', 'agent-docstrings.yaml'),
    },
    {
      path: '.github/workflows/automation-maintainer.yaml',
      content: generateProxyWorkflow(
        repoStandard,
        'Automation Maintainer',
        'automation-maintainer.yaml',
        "on:\\n  schedule:\\n    - cron: '0 0 * * 0'",
      ),
    },
  ];
}

export function shouldIncludeCloudflareWorkflow(files: string[]): boolean {
  return files.some(
    (file) =>
      file.endsWith('wrangler.toml') ||
      file.endsWith('wrangler.json') ||
      file.endsWith('wrangler.jsonc'),
  );
}
