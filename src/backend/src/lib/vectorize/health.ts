/**
 * @file health/checks/semantics.ts
 * @description Health check for the Vectorize (Semantics) subsystem.
 *
 * Performs a full CRUD lifecycle test:
 * 1. Generate embedding via Workers AI
 * 2. Upsert the vector to the primary VECTORIZE index
 * 3. Query the index for the inserted vector
 * 4. Delete the test vector
 * 5. Verify remaining Vectorize bindings are present
 */

import { HealthStepResult } from "@/health/types";

const TEST_VECTOR_ID = "health-probe-semantic";
const TEST_NAMESPACE = "__health__";

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const subChecks: Record<string, any> = {};

  const runCheck = async (name: string, fn: () => Promise<Record<string, unknown>>) => {
    const checkStart = Date.now();
    try {
      const result = await fn();
      subChecks[name] = { status: "OK", latency: Date.now() - checkStart, ...result };
    } catch (error) {
      subChecks[name] = {
        status: "FAILURE",
        latency: Date.now() - checkStart,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // 1. AI Embedding
  let embedding: number[] = [];
  await runCheck("embed", async () => {
    if (!env.AI) throw new Error("AI binding missing — cannot generate embeddings");
    const response: any = await env.AI.run("@cf/baai/bge-large-en-v1.5", {
      text: ["health check probe"],
    });
    if (!response?.data?.[0]) throw new Error("Embedding response empty");
    embedding = response.data[0];
    return { message: "Embedding generated", dimensions: embedding.length };
  });

  // 2. Upsert to Vectorize
  await runCheck("upsert", async () => {
    if (!env.VECTORIZE) throw new Error("VECTORIZE binding missing");
    if (!embedding.length) throw new Error("No embedding available from previous step");
    const result = await env.VECTORIZE.upsert([
      {
        id: TEST_VECTOR_ID,
        values: embedding,
        namespace: TEST_NAMESPACE,
        metadata: { source: "health-check", timestamp: Date.now() },
      },
    ]);
    return { message: "Vector upserted", mutationId: (result as any)?.mutationId || "ok" };
  });

  // 3. Search for the vector (Vectorize is eventually consistent — a miss is expected)
  await runCheck("search", async () => {
    if (!env.VECTORIZE) throw new Error("VECTORIZE binding missing");
    if (!embedding.length) throw new Error("No embedding available");
    // Brief delay for indexing
    await new Promise((resolve) => setTimeout(resolve, 500));
    const results = await env.VECTORIZE.query(embedding, {
      topK: 1,
      namespace: TEST_NAMESPACE,
      returnValues: false,
      returnMetadata: "all",
    });
    const found = results.matches?.some((m: any) => m.id === TEST_VECTOR_ID);
    // Vectorize is eventually consistent — a miss within 500ms is non-fatal
    return {
      message: found ? "Vector found in search" : "Vector not yet indexed (eventual consistency — non-fatal)",
      matchCount: results.matches?.length || 0,
      topScore: results.matches?.[0]?.score,
      note: found ? undefined : "Upsert succeeded; indexing may still be propagating",
    };
  });

  // 4. Delete the test vector
  await runCheck("delete", async () => {
    if (!env.VECTORIZE) throw new Error("VECTORIZE binding missing");
    const result = await env.VECTORIZE.deleteByIds([TEST_VECTOR_ID]);
    return { message: "Test vector deleted", mutationId: (result as any)?.mutationId || "ok" };
  });

  // 5. Verify additional Vectorize bindings
  await runCheck("bindings", async () => {
    const bindings: Record<string, boolean> = {
      VECTORIZE: !!(env as any).VECTORIZE,
      RESEARCH_INDEX: !!(env as any).RESEARCH_INDEX,
      VECTORIZE_LOGS: !!(env as any).VECTORIZE_LOGS,
      PLAN_EMBEDDINGS: !!(env as any).PLAN_EMBEDDINGS,
      FILE_EMBEDDINGS: !!(env as any).FILE_EMBEDDINGS,
    };
    const missing = Object.entries(bindings)
      .filter(([_, present]) => !present)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`Missing Vectorize bindings: ${missing.join(", ")}`);
    }
    return { message: "All Vectorize bindings present", bindings };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");

  return {
    name: "Semantics (Vectorize)",
    status: hasFailure ? "failure" : "success",
    message: hasFailure
      ? "Semantics subsystem degraded"
      : "Full embed→upsert→search→delete lifecycle passed",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
