import { generateEmbeddings } from "@/ai/providers";
import type { PlanningArtifactUrls } from "./monitor";

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

export function buildPlanningArtifactUrls(
  env: Env,
  requestId: string,
): PlanningArtifactUrls {
  const baseUrl = getBaseUrl(env);
  const artifactPath = `${baseUrl}/api/planning/${requestId}/artifact`;
  return {
    viewUrl: artifactPath,
    rawUrl: `${artifactPath}?raw=1`,
    downloadUrl: `${artifactPath}?download=1`,
  };
}

export async function upsertPlanningMarkdownArtifact(
  env: Env,
  requestId: string,
  markdown: string,
): Promise<{ key: string; urls: PlanningArtifactUrls }> {
  const key = buildPlanningArtifactKey(requestId);
  await env.PLAN_ARTIFACTS.put(key, markdown, {
    httpMetadata: {
      contentType: "text/markdown; charset=utf-8",
    },
  });

  return {
    key,
    urls: buildPlanningArtifactUrls(env, requestId),
  };
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
    markdown: string;
  },
): Promise<string | null> {
  const chunks = chunkMarkdown(options.markdown);
  if (!chunks.length) {
    return null;
  }

  const embeddings = await generateEmbeddings(env, chunks);
  await env.PLAN_EMBEDDINGS.upsert(
    embeddings.map((values, index) => ({
      id: `planning:${options.requestId}:${index}`,
      values,
      metadata: {
        requestId: options.requestId,
        projectId: options.projectId || "",
        chunkIndex: index,
        text: chunks[index].slice(0, 500),
      },
    })),
  );

  return options.requestId;
}
