import { describe, expect, it } from "vitest";
import {
  JulesCodingTaskInputSchema,
  PlanningRequestInputSchema,
} from "../src/backend/src/lib/schemas/jules";
import { extractFilesFromDiff } from "../src/backend/src/services/planning/honi-babysitter";
import { buildPlanningArtifactUrls } from "../src/backend/src/services/planning/artifacts";

describe("planning schemas", () => {
  it("accepts a valid repo-bound planning request", () => {
    const result = PlanningRequestInputSchema.parse({
      workstream: "project_planning",
      prompt: "Implement planning service",
      githubRepo: "cloudflare/workers-sdk",
      baseBranch: "main",
      dryRun: true,
    });

    expect(result.githubRepo).toBe("cloudflare/workers-sdk");
    expect(result.baseBranch).toBe("main");
  });

  it("rejects malformed repos", () => {
    const parsed = JulesCodingTaskInputSchema.safeParse({
      prompt: "Invalid repo",
      githubRepo: "cloudflare/workers-sdk/issues",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("planning helpers", () => {
  it("extracts added file content from unified diff text", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -0,0 +1,2 @@",
      "+export const value = 1;",
      "+export const label = 'ok';",
    ].join("\n");

    const files = extractFilesFromDiff(diff);
    expect(files.get("src/a.ts")).toContain("export const value = 1;");
  });

  it("builds stable planning artifact urls", () => {
    const urls = buildPlanningArtifactUrls(
      { BASE_URL: "https://example.com" } as unknown as Env,
      "req-123",
    );

    expect(urls.viewUrl).toBe("https://example.com/api/planning/req-123/plan");
    expect(urls.rawUrl).toBe("https://example.com/api/planning/req-123/plan.md");
    expect(urls.downloadUrl).toBe("https://example.com/api/planning/req-123/download");
  });
});
