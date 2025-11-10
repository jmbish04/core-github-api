import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import * as S from "../schemas/apiSchemas";
import { z } from "zod";

export function buildOpenAPIDocument(baseUrl: string) {
  const registry = new OpenAPIRegistry();

  // Register schemas
  registry.register("Task", S.Task);
  registry.register("CreateTaskRequest", S.CreateTaskRequest);
  registry.register("CreateTaskResponse", S.CreateTaskResponse);
  registry.register("ListTasksResponse", S.ListTasksResponse);
  registry.register("AnalysisRequest", S.AnalysisRequest);
  registry.register("AnalysisResponse", S.AnalysisResponse);
  registry.register("ErrorResponse", S.ErrorResponse);

  // Health and Test Schemas
    const TestDefSchema = z.object({
        id: z.string().uuid(),
        name: z.string(),
        description: z.string(),
        category: z.string().optional(),
        severity: z.string().optional(),
    });

    const TestResultSchema = z.object({
        id: z.string().uuid(),
        session_uuid: z.string().uuid(),
        test_fk: z.string().uuid(),
        started_at: z.string().datetime(),
        finished_at: z.string().datetime().optional(),
        duration_ms: z.number().int().optional(),
        status: z.enum(['pass', 'fail']),
        error_code: z.string().optional(),
        ai_human_readable_error_description: z.string().optional(),
        test: TestDefSchema,
    });

    const HealthResponseSchema = z.object({
        healthy: z.boolean(),
        last_test_session: z.object({
            session_uuid: z.string().uuid().nullable(),
            results: z.array(TestResultSchema),
        }),
    });

    const RunTestsResponseSchema = z.object({
        success: z.boolean(),
        session_uuid: z.string().uuid(),
    });

    const SessionResultsResponseSchema = z.object({
        session_uuid: z.string().uuid(),
        results: z.array(TestResultSchema),
    });

    const TestDefsResponseSchema = z.object({
        defs: z.array(TestDefSchema),
    });

    registry.register("HealthResponse", HealthResponseSchema);
    registry.register("RunTestsResponse", RunTestsResponseSchema);
    registry.register("SessionResultsResponse", SessionResultsResponseSchema);
    registry.register("TestDefsResponse", TestDefsResponseSchema);

  // Paths
  registry.registerPath({
    method: "post",
    path: "/api/tasks",
    summary: "Create a task",
    request: { body: { content: { "application/json": { schema: S.CreateTaskRequest } } } },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: S.CreateTaskResponse } } },
      400: { description: "Bad Request", content: { "application/json": { schema: S.ErrorResponse } } },
    },
    tags: ["Tasks"],
  });

  registry.registerPath({
    method: "get",
    path: "/api/tasks",
    summary: "List tasks",
    responses: {
      200: { description: "OK", content: { "application/json": { schema: S.ListTasksResponse } } },
    },
    tags: ["Tasks"],
  });

  registry.registerPath({
    method: "post",
    path: "/api/analyze",
    summary: "Run analysis",
    request: { body: { content: { "application/json": { schema: S.AnalysisRequest } } } },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: S.AnalysisResponse } } },
      400: { description: "Bad Request", content: { "application/json": { schema: S.ErrorResponse } } },
    },
    tags: ["Analysis"],
  });

  // Health and Test Paths
  registry.registerPath({
      method: "get",
      path: "/api/health",
      summary: "Get system health",
      responses: {
          200: { description: "OK", content: { "application/json": { schema: HealthResponseSchema } } },
      },
      tags: ["Health"],
  });

  registry.registerPath({
      method: "post",
      path: "/api/tests/run",
      summary: "Run all health tests",
      responses: {
          200: { description: "OK", content: { "application/json": { schema: RunTestsResponseSchema } } },
      },
      tags: ["Health"],
  });

  registry.registerPath({
      method: "get",
      path: "/api/tests/latest",
      summary: "Get latest test session results",
      responses: {
          200: { description: "OK", content: { "application/json": { schema: SessionResultsResponseSchema } } },
      },
      tags: ["Health"],
  });

    registry.registerPath({
        method: "get",
        path: "/api/tests/session/{id}",
        summary: "Get results for a specific test session",
        request: {
            params: z.object({ id: z.string().uuid() }),
        },
        responses: {
            200: { description: "OK", content: { "application/json": { schema: SessionResultsResponseSchema } } },
        },
        tags: ["Health"],
    });

    registry.registerPath({
        method: "get",
        path: "/api/tests/defs",
        summary: "Get active test definitions",
        responses: {
            200: { description: "OK", content: { "application/json": { schema: TestDefsResponseSchema } } },
        },
        tags: ["Health"],
    });


  const generator = new OpenApiGeneratorV31(registry.definitions);
  const doc = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Multi-Protocol Worker API",
      version: "1.0.0",
      description: "REST + WS + RPC + MCP + Health",
    },
    servers: [{ url: baseUrl }],
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    tags: [{ name: "Tasks" }, { name: "Analysis" }, { name: "Health" }],
  });

  return doc;
}
