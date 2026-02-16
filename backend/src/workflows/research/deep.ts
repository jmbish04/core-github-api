/**
 * @file backend/src/workflows/DeepResearchWorkflow.ts
 * @description Long-running research workflow using GitHub API + D1 + Vectorize for code analysis
 * @owner Agentic Research Team
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { parseGitHubUrl, fetchGitHubTree, fetchCriticalFiles } from "@/ai/mcp/tools/github/research";
import { getWebhooksDb, researchFiles} from "@/db";

interface DeepResearchWorkflowParams {
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  requestedBy?: string;
  mode?: "discovery" | "targeted";
}

interface ResearchFindings {
  repoUrl: string;
  fileTree: string[];
  readmeContent: string | null;
  vectorizedFiles: number;
  d1RecordsCreated: number;
  insights: string;
}

export class DeepResearchWorkflow extends WorkflowEntrypoint<Env, DeepResearchWorkflowParams> {
  async run(
    event: Readonly<WorkflowEvent<DeepResearchWorkflowParams>>,
    step: WorkflowStep
  ): Promise<ResearchFindings> {
    const { repoUrl, repoOwner, repoName, mode = "targeted" } = event.payload;

    // Step 1: Fetch File Tree via GitHub API (Fast, no Sandbox needed)
    const analysis = await step.do("fetch-tree-and-readme", async () => {
      console.log(`[DeepResearchWorkflow] Fetching file tree for ${repoOwner}/${repoName}`);
      
      // Get GitHub token
      const token = await this.env.GITHUB_TOKEN.get();
      
      // Fetch file tree via GitHub API
      const fileTree = await fetchGitHubTree(repoOwner, repoName, token);
      
      // Fetch critical files (README, package.json, etc.)
      const criticalTargets = ["README.md", "readme.md", "package.json", "pyproject.toml", "Cargo.toml"];
      const criticalFiles = await fetchCriticalFiles(repoOwner, repoName, fileTree, criticalTargets, token);
      
      const readmeContent = criticalFiles["README.md"] || criticalFiles["readme.md"] || null;
      
      return {
        fileTree,
        readmeContent,
        criticalFiles,
        totalFiles: fileTree.length,
      };
    });

    // Step 2: Vectorize Code Files + Create D1 Records with AI Analysis
    const vectorizationResult = await step.do("vectorize-and-analyze", async () => {
      // Filter code files (skip binaries, images, etc.)
      const codeExtensions = [".ts", ".js", ".py", ".go", ".rs", ".java", ".cpp", ".c", ".md"];
      const codeFiles = analysis.fileTree.filter((path: string) =>
        codeExtensions.some((ext) => path.endsWith(ext))
      ).slice(0, 50); // Limit to 50 files for now

      let vectorizedCount = 0;
      let d1RecordsCreated = 0;
      const token = await this.env.GITHUB_TOKEN.get();
      const db = getWebhooksDb(this.env.DB_WEBHOOKS);

      for (const filePath of codeFiles) {
        try {
          // 1. Generate UUID for this file
          const fileUuid = crypto.randomUUID();
          
          // 2. Fetch file content via GitHub raw URL
          const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${filePath}`;
          const response = await fetch(rawUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (!response.ok) continue;
          const content = await response.text();

          if (!content || content.length === 0) continue;

          // 3. Perform AI Analysis on the file
          const fileAnalysis = await this.analyzeFile(filePath, content, analysis.fileTree);

          // 4. Create D1 record
          await db.insert(researchFiles).values({
            id: fileUuid,
            owner: repoOwner,
            repo: repoName,
            filename: filePath.split('/').pop() || filePath,
            filepath: filePath,
            extension: filePath.includes('.') ? '.' + filePath.split('.').pop() : null,
            sizeBytes: content.length,
            analysis: fileAnalysis,
          });
          
          d1RecordsCreated++;

          // 5. Chunk the file and vectorize with UUID linkage
          const lines = content.split("\n");
          const chunkSize = 100;
          
          for (let i = 0; i < lines.length; i += chunkSize) {
            const chunk = lines.slice(i, i + chunkSize).join("\n");
            
            if (chunk.trim().length < 50) continue; // Skip tiny chunks

            // Generate embedding
            const embeddingResponse = await this.env.AI.run("@cf/baai/bge-large-en-v1.5", {
              text: chunk,
            });

            // Extract embedding vector from response
            // Response structure: { shape: [1, 1024], data: [[...1024 floats]], pooling: "mean" }
            const embedding = (embeddingResponse as any).data?.[0] || [];

            if (embedding.length === 0) {
              console.warn(`[DeepResearchWorkflow] Empty embedding for ${filePath}:${i}`);
              continue;
            }

            // Upsert to Vectorize with UUID in the ID
            await this.env.RESEARCH_INDEX.upsert([
              {
                id: `${fileUuid}:chunk:${i}`, // UUID-based ID for linking
                values: embedding,
                metadata: {
                  fileUuid, // Store UUID in metadata for easy lookup
                  repo: `${repoOwner}/${repoName}`,
                  filepath: filePath,
                  chunkIndex: i,
                  lines: `${i + 1}-${Math.min(i + chunkSize, lines.length)}`,
                },
              },
            ]);

            vectorizedCount++;
          }
        } catch (error) {
          console.error(`[DeepResearchWorkflow] Failed to process ${filePath}:`, error);
        }
      }

      return {
        vectorizedFiles: codeFiles.length,
        vectorizedChunks: vectorizedCount,
        d1RecordsCreated,
      };
    });

    // Step 3: Generate Insights using AI
    const insights = await step.do("generate-insights", async () => {
      const prompt = `
Analyze the following repository and provide key insights:

Repository: ${repoOwner}/${repoName}
Total Files: ${analysis.totalFiles}
README:
${analysis.readmeContent || "No README available"}

File Tree (sample):
${analysis.fileTree.slice(0, 20).join("\n")}

Provide a concise summary of:
1. What this repository does
2. Key technologies used
3. Potential use cases or applications
4. Notable patterns or architecture
`;

      const response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          {
            role: "system",
            content: "You are a senior software architect analyzing GitHub repositories.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      return (response as any).response || "No insights generated";
    });

    // Return findings (No Sandbox cleanup needed!)
    return {
      repoUrl,
      fileTree: analysis.fileTree,
      readmeContent: analysis.readmeContent,
      vectorizedFiles: vectorizationResult.vectorizedChunks,
      d1RecordsCreated: vectorizationResult.d1RecordsCreated,
      insights,
    };
  }

  /**
   * Analyze a file using AI to generate structured insights via JSON Mode
   */
  private async analyzeFile(filepath: string, content: string, allFiles: string[]) {
    // Schema definition based on your requested structure
    const analysisSchema = {
      type: "object",
      properties: {
        zoomedIn: {
          type: "object",
          properties: {
            purpose: { type: "string" },
            keyFunctions: { type: "array", items: { type: "string" } },
            complexity: { type: "string", enum: ["low", "medium", "high"] },
            codeQuality: { type: "string" }
          },
          required: ["purpose", "keyFunctions", "complexity", "codeQuality"]
        },
        zoomedOut: {
          type: "object",
          properties: {
            role: { type: "string" },
            importance: { type: "string", enum: ["critical", "important", "supporting", "utility"] },
            architecturalLayer: { type: "string" }
          },
          required: ["role", "importance", "architecturalLayer"]
        },
        fileDependencies: { type: "array", items: { type: "string" } },
        dependenciesOnFile: { type: "array", items: { type: "string" } }
      },
      required: ["zoomedIn", "zoomedOut", "fileDependencies", "dependenciesOnFile"]
    };

    const userPrompt = `Analyze this code file from the repository.
Filepath: ${filepath}
Total Repository Files (for context): ${allFiles.length} files

Content (first 40,000 chars):
${content.substring(0, 40000)}`;

    try {
      // Calling the model with response_format set to json_schema
      const response = await this.env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
        messages: [
          { 
            role: "system", 
            content: "You are a code analysis expert. Provide a technical breakdown of the provided file based on the requested schema." 
          },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: analysisSchema
        }
      });

      // Workers AI returns the validated object under the 'response' key
      return (response as any).response;
    } catch (error) {
      console.error(`[DeepResearchWorkflow] AI analysis failed for ${filepath}:`, error);
      
      // Return standard default structure on failure
      return {
        zoomedIn: {
          purpose: "Analysis failed",
          keyFunctions: [],
          complexity: "medium",
          codeQuality: "Unable to analyze",
        },
        zoomedOut: {
          role: "Unknown",
          importance: "supporting",
          architecturalLayer: "Unknown",
        },
        fileDependencies: [],
        dependenciesOnFile: [],
      };
    }
  }
}
