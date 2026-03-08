import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { AiDocGenService } from "../../../../services/ai-doc-gen/service";

export const AiDocGenRequestSchema = z.object({
  owner: z.string().min(1).openapi({ example: "jmbish04" }),
  repo: z.string().min(1).openapi({ example: "core-github-api" }),
  branch: z.string().min(1).optional().openapi({ example: "main" }),
  customInstructions: z.string().max(4000).optional().openapi({
    example: "Focus heavily on authentication and request flows.",
  }),
});

export const AiDocGenResponseSchema = z.object({
  success: z.boolean(),
  branchName: z.string(),
  prNumber: z.number(),
  prUrl: z.string().url(),
  generatedPaths: z.array(z.string()),
});

const AiDocGenErrorResponseSchema = z.object({
  success: z.literal(false),
  branchName: z.string(),
  prNumber: z.number(),
  prUrl: z.string(),
  generatedPaths: z.array(z.string()),
  error: z.string(),
});

export const docGenRoute = createRoute({
  method: "post",
  path: "/github/repos/doc-gen",
  operationId: "generateGithubRepositoryAiDocs",
  summary: "Generate repository architecture docs and agent rules",
  description: "Runs a multi-agent Honi workflow, commits generated docs to a new branch, and opens a pull request with a PAT-authenticated user identity.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: AiDocGenRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AiDocGenResponseSchema,
        },
      },
      description: "AI docs generated and pull request created successfully.",
    },
    500: {
      content: {
        "application/json": {
          schema: AiDocGenErrorResponseSchema,
        },
      },
      description: "Failed to generate AI docs.",
    },
  },
  "x-agent": true,
});

const docGenApi = new OpenAPIHono<{ Bindings: Env }>();

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to generate AI docs.";
}

docGenApi.openapi(docGenRoute, async (c) => {
  const payload = c.req.valid("json");

  try {
    const result = await AiDocGenService.createPullRequest(c.env, payload);
    return c.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    console.error("[ai-doc-gen] failed to create PR", error);
    return c.json({
      success: false,
      branchName: "",
      prNumber: 0,
      prUrl: "",
      generatedPaths: [],
      error: getErrorMessage(error),
    }, 500);
  }
});

export default docGenApi;
