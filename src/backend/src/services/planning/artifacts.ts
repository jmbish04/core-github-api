import { AIProvider } from "@/ai/providers";
import type { PlanningArtifactUrls } from "./monitor";
import { createPlanningArtifact } from "./store";

const DEFAULT_CHUNK_SIZE = 1800;

function getBaseUrl(env: Env): string {
  return (env.BASE_URL || "https://core-github-api.hacolby.workers.dev").replace(/\/$/, "");
}

function chunkMarkdown(markdown: string, maxChars = DEFAULT_CHUNK_SIZE): string[] {
  const normalized = markdown.trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    for (let start = 0; start < paragraph.length; start += maxChars) {
      chunks.push(paragraph.slice(start, start + maxChars));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function buildPlanningArtifactKey(requestId: string): string {
  return `planning/${requestId}/plan.md`;
}

export function buildNamedPlanningArtifactKey(requestId: string, name: string): string {
  return `planning/${requestId}/${name.replace(/^\/+/, "")}`;
}

export function buildPlanningArtifactUrls(
  env: Env,
  requestId: string,
): PlanningArtifactUrls {
  const baseUrl = getBaseUrl(env);
  const artifactPath = `${baseUrl}/api/planning/${requestId}/plan`;
  return {
    viewUrl: artifactPath,
    rawUrl: `${baseUrl}/api/planning/${requestId}/plan.md`,
    downloadUrl: `${baseUrl}/api/planning/${requestId}/download`,
  };
}

export async function upsertPlanningMarkdownArtifact(
  env: Env,
  requestId: string,
  markdown: string,
): Promise<{ artifactId: string; key: string; urls: PlanningArtifactUrls }> {
  const key = buildPlanningArtifactKey(requestId);
  await env.PLAN_ARTIFACTS.put(key, markdown, {
    httpMetadata: {
      contentType: "text/markdown; charset=utf-8",
    },
  });

  const artifactId = await createPlanningArtifact(env, {
    requestId,
    artifactKind: "jules_plan_markdown",
    storageDriver: "r2",
    storageKey: key,
    mimeType: "text/markdown; charset=utf-8",
    contentText: markdown.slice(0, 4000),
    metadata: {
      size: markdown.length,
    },
  });

  return {
    artifactId,
    key,
    urls: buildPlanningArtifactUrls(env, requestId),
  };
}

export async function putPlanningTextArtifact(
  env: Env,
  input: {
    requestId: string;
    name: string;
    artifactKind:
      | "jules_plan_markdown"
      | "jules_change_set"
      | "stitch_spec"
      | "stitch_image"
      | "orchestrated_plan_json"
      | "vector_document"
      | "github_plan_commit"
      | "github_pr";
    content: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
  },
) {
  const key = buildNamedPlanningArtifactKey(input.requestId, input.name);
  await env.PLAN_ARTIFACTS.put(key, input.content, {
    httpMetadata: {
      contentType: input.mimeType,
    },
  });

  const artifactId = await createPlanningArtifact(env, {
    requestId: input.requestId,
    artifactKind: input.artifactKind,
    storageDriver: "r2",
    storageKey: key,
    mimeType: input.mimeType,
    contentText: input.content.slice(0, 4000),
    metadata: input.metadata || null,
  });

  return { artifactId, key };
}

export async function getPlanningMarkdownArtifact(
  env: Env,
  key: string,
): Promise<R2ObjectBody | null> {
  return env.PLAN_ARTIFACTS.get(key);
}

export async function vectorizePlanningArtifact(
  env: Env,
  options: {
    requestId: string;
    projectId?: string;
    projectName?: string;
    repoFullName?: string;
    workstream?: string;
    markdown: string;
  },
): Promise<string | null> {
  const chunks = chunkMarkdown(options.markdown);
  if (!chunks.length) {
    return null;
  }

  const ai = new AIProvider(env);
  const embeddings = await ai.generateEmbeddings( chunks);
  await env.PLAN_EMBEDDINGS.upsert(
    embeddings.map((values, index) => ({
      id: `planning:${options.requestId}:${index}`,
      values,
      metadata: {
        requestId: options.requestId,
        projectId: options.projectId || "",
        projectName: options.projectName || "",
        repoFullName: options.repoFullName || "",
        workstream: options.workstream || "",
        artifactKind: "jules_plan_markdown",
        chunkIndex: index,
        text: chunks[index].slice(0, 500),
      },
    })),
  );

  await createPlanningArtifact(env, {
    requestId: options.requestId,
    artifactKind: "vector_document",
    storageDriver: "vectorize",
    storageKey: options.requestId,
    mimeType: "application/json",
    metadata: {
      requestId: options.requestId,
      projectId: options.projectId || null,
      projectName: options.projectName || null,
      repoFullName: options.repoFullName || null,
      workstream: options.workstream || null,
      chunks: chunks.length,
    },
  });

  return options.requestId;
}

export async function queryPlanningArtifacts(
  env: Env,
  options: {
    query: string;
    requestId?: string;
    projectId?: string;
    projectName?: string;
    topK?: number;
  },
) {
  const ai = new AIProvider(env);
  const embeddings = await ai.generateEmbeddings( [options.query]);
  const [vector] = embeddings;

  if (!vector) {
    return [];
  }

  const filter: Record<string, string> = {};
  if (options.requestId) {
    filter.requestId = options.requestId;
  }
  if (options.projectId) {
    filter.projectId = options.projectId;
  }
  if (options.projectName) {
    filter.projectName = options.projectName;
  }

  const response = await env.PLAN_EMBEDDINGS.query(vector, {
    topK: Math.min(Math.max(options.topK || 8, 1), 25),
    returnMetadata: true,
    filter: Object.keys(filter).length ? filter : undefined,
  });

  return response.matches || [];
}
