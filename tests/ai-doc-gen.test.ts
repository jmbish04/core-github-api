import { describe, expect, it } from "vitest";

describe("AI Doc Generator service", () => {
  it("builds generated file maps with the required static workflow and standards files", async () => {
    const {
      IMPLEMENT_FEATURE_WORKFLOW_PATH,
      DOC_GEN_STANDARDS_PATH,
      IMPLEMENT_FEATURE_WORKFLOW_CONTENT,
      DOC_GEN_STANDARDS_CONTENT,
      buildGeneratedFileMap,
    } = await import("../backend/src/services/ai-doc-gen/service");

    const fileMap = buildGeneratedFileMap(
      {
        "structure_analysis.md": "# Structure Analysis",
        "api_analysis.md": "# API Analysis",
      },
      {
        "repo-doc-gen-rules.md": "# Rules",
      },
    );

    expect(fileMap.get(".ai/docs/structure_analysis.md")).toBe("# Structure Analysis");
    expect(fileMap.get(".ai/docs/api_analysis.md")).toBe("# API Analysis");
    expect(fileMap.get(".agent/rules/repo-doc-gen-rules.md")).toBe("# Rules");
    expect(fileMap.get(IMPLEMENT_FEATURE_WORKFLOW_PATH)).toBe(IMPLEMENT_FEATURE_WORKFLOW_CONTENT.trim());
    expect(fileMap.get(DOC_GEN_STANDARDS_PATH)).toBe(DOC_GEN_STANDARDS_CONTENT.trim());
    expect(DOC_GEN_STANDARDS_CONTENT).toContain("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  });

  it("exposes the doc-gen endpoint schema with custom instructions support", async () => {
    const { AiDocGenRequestSchema } = await import("../backend/src/ai/mcp/tools/github/doc-gen");

    const parsed = AiDocGenRequestSchema.parse({
      owner: "jmbish04",
      repo: "core-github-api",
      branch: "main",
      customInstructions: "Focus on auth flows",
    });

    expect(parsed.owner).toBe("jmbish04");
    expect(parsed.repo).toBe("core-github-api");
    expect(parsed.branch).toBe("main");
    expect(parsed.customInstructions).toBe("Focus on auth flows");
  });
});
