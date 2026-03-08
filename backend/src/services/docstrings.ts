import { generateDocstringsForProject } from "@/automations/pr/docstrings";

export type { DocstringResult } from "@/automations/pr/docstrings";

export class DocstringsService {
  constructor(private readonly env: Env) {}

  async generateForProject(
    owner: string,
    repo: string,
    files: string[]
  ): Promise<{ prUrl: string; branchName: string }> {
    return generateDocstringsForProject(this.env, owner, repo, files);
  }
}
