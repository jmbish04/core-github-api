import { generateText } from "@/ai/providers";
import { getOctokit } from "./octokit/core";
import { generateUuid } from "@/utils/common";

export interface DocstringResult {
  filePath: string;
  originalContent: string;
  updatedContent: string;
}

export class DocstringsService {
  constructor(private readonly env: Env) {}

  async generateForProject(
    owner: string,
    repo: string,
    files: string[]
  ): Promise<{ prUrl: string; branchName: string }> {
    const octokit = await getOctokit(this.env);
    const results: DocstringResult[] = [];

    // 1. Process files (limit to first 5 for now to avoid timeouts/limits)
    const priorityFiles = files.slice(0, 5);
    
    for (const path of priorityFiles) {
      const content = await this.fetchFile(owner, repo, path);
      if (!content) continue;

      const docstrings = await this.generateDocstrings(path, content);
      if (docstrings && docstrings !== content) {
        results.push({
          filePath: path,
          originalContent: content,
          updatedContent: docstrings
        });
      }
    }

    if (results.length === 0) {
      throw new Error("No docstring improvements generated.");
    }

    // 2. Create PR
    const branchName = `ai-docstrings-${generateUuid().substring(0, 8)}`;
    const repoResponse = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoResponse.data.default_branch;

    // Get latest commit on default branch
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`
    });
    
    // Create new branch
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha
    });

    // Commit each file
    for (const res of results) {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: res.filePath,
        message: `docs: generate docstrings for ${res.filePath}`,
        content: Buffer.from(res.updatedContent).toString("base64"),
        branch: branchName
      });
    }

    // Create PR
    const prResponse = await octokit.pulls.create({
      owner,
      repo,
      title: "docs: AI-generated docstrings",
      head: branchName,
      base: defaultBranch,
      body: "This PR adds AI-generated docstrings to improve code documentation and clarity.\n\nGenerated using gpt-oss-120b."
    });

    return {
      prUrl: prResponse.data.html_url,
      branchName
    };
  }

  private async fetchFile(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const octokit = await getOctokit(this.env);
      const response = await octokit.repos.getContent({ owner, repo, path });
      const data = response.data as any;
      if (data.type === "file" && data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return null;
    } catch {
      return null;
    }
  }

  private async generateDocstrings(path: string, content: string): Promise<string> {
    const systemPrompt = `You are a senior technical writer and software engineer.
Your task is to add high-quality TSDoc/JSDoc/Docstrings to the provided code.
Focus on:
1. Exported functions, classes, and interfaces.
2. Parameters, return values, and exceptions.
3. Complex logic that needs explanation.
4. Keeping existing code EXACTLY as is, only adding docstrings above the declarations.
Return the ENTIRE file content with the docstrings added.`;

    const prompt = `File: ${path}\n\nCode:\n${content}`;
    
    return await generateText(this.env, prompt, systemPrompt, {
      model: "@cf/openai/gpt-oss-120b",
      temperature: 0.1,
    }, "worker-ai");
  }
}
