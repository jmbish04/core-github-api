import { generateDocstringsForProject } from "@/automations/pr/docstring_generator/service";

export type { DocstringResult } from "@/automations/pr/docstring_generator/service";

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
