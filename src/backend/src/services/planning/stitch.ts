import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function resolveStitchApiKey(env: Env): Promise<string | null> {
  const value = env.STITCH_API_KEY;
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "get" in value && typeof value.get === "function") {
    return await value.get();
  }

  return null;
}

async function withStitchClient<T>(env: Env, callback: (client: Client) => Promise<T>): Promise<T> {
  const apiKey = await resolveStitchApiKey(env);
  if (!apiKey) {
    throw new Error("STITCH_API_KEY is not configured");
  }

  const headers = { "X-Goog-Api-Key": apiKey };
  const fetchWithHeaders: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...headers,
      },
    });

  const transport = new SSEClientTransport(new URL("https://stitch.googleapis.com/mcp"), {
    requestInit: { headers },
    eventSourceInit: { fetch: fetchWithHeaders },
    fetch: fetchWithHeaders,
  });
  const client = new Client(
    { name: "core-github-api-planning-stitch", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close();
  }
}

function readTextContent(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(content)) {
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  }

  const textParts = content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string);

  return textParts.join("\n\n").trim() || JSON.stringify(result, null, 2);
}

export interface StitchSpecResult {
  markdown: string;
  metadata: {
    projectId: string;
    screenIds: string[];
    fetchedAt: string;
  };
}

export async function buildStitchSpec(
  env: Env,
  input: {
    stitchProjectId: string;
    stitchScreenIds?: string[];
  },
): Promise<StitchSpecResult> {
  const fetchedAt = new Date().toISOString();

  try {
    return await withStitchClient(env, async (client) => {
      const project = await client.callTool({
        name: "get_project",
        arguments: { name: `projects/${input.stitchProjectId}` },
      });

      const screenList = await client.callTool({
        name: "list_screens",
        arguments: { projectId: input.stitchProjectId },
      });

      const selectedScreenIds = input.stitchScreenIds?.length
        ? input.stitchScreenIds
        : [];

      const screens: string[] = [];
      for (const screenId of selectedScreenIds) {
        const screen = await client.callTool({
          name: "get_screen",
          arguments: {
            name: `projects/${input.stitchProjectId}/screens/${screenId}`,
            projectId: input.stitchProjectId,
            screenId,
          },
        });
        screens.push(readTextContent(screen));
      }

      const markdown = [
        "# Stitch Design Spec",
        "",
        `- Project ID: ${input.stitchProjectId}`,
        `- Selected screens: ${selectedScreenIds.length ? selectedScreenIds.join(", ") : "all available / none specified"}`,
        `- Fetched at: ${fetchedAt}`,
        "",
        "## Project",
        "",
        readTextContent(project),
        "",
        "## Screen Index",
        "",
        readTextContent(screenList),
        ...(screens.length
          ? [
              "",
              "## Selected Screen Details",
              "",
              ...screens.flatMap((screen, index) => [
                `### Screen ${index + 1}`,
                "",
                screen,
                "",
              ]),
            ]
          : []),
      ].join("\n");

      return {
        markdown,
        metadata: {
          projectId: input.stitchProjectId,
          screenIds: selectedScreenIds,
          fetchedAt,
        },
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Stitch spec";
    return {
      markdown: [
        "# Stitch Design Spec",
        "",
        `- Project ID: ${input.stitchProjectId}`,
        `- Selected screens: ${input.stitchScreenIds?.join(", ") || "none specified"}`,
        `- Fetched at: ${fetchedAt}`,
        "",
        "## Retrieval Status",
        "",
        `Stitch spec retrieval failed: ${message}`,
        "",
        "Proceed after design approval once the Stitch artifact source is reachable.",
      ].join("\n"),
      metadata: {
        projectId: input.stitchProjectId,
        screenIds: input.stitchScreenIds || [],
        fetchedAt,
      },
    };
  }
}
