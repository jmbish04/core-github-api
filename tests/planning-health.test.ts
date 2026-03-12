import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fromMock = vi.fn();
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const getDbMock = vi.fn(() => ({ select: selectMock }));
  const getAgentByNameMock = vi.fn();

  return {
    fromMock,
    selectMock,
    getDbMock,
    getAgentByNameMock,
  };
});

vi.mock("@db", () => ({
  getDb: mocks.getDbMock,
  projectPlanningRequests: { id: "planning_requests" },
}));

vi.mock("@/ai/agents/runtime/agents", () => ({
  getAgentByName: mocks.getAgentByNameMock,
}));

import { checkHealth } from "../backend/src/workflows/planning/health";

describe("planning health", () => {
  beforeEach(() => {
    mocks.fromMock.mockReset();
    mocks.selectMock.mockClear();
    mocks.getDbMock.mockClear();
    mocks.getAgentByNameMock.mockReset();
  });

  it("reports success when planning dependencies are reachable", async () => {
    mocks.fromMock.mockResolvedValue([{ value: 2 }]);
    mocks.getAgentByNameMock.mockResolvedValue({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ status: "ok", agent: "PlannerAgent" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    });

    const env = {
      DB: {},
      PLANNING_ORCHESTRATOR: {
        get: vi.fn().mockResolvedValue({
          status: vi.fn().mockResolvedValue({ status: "unknown" }),
        }),
      },
      PLANNING_MONITOR: {
        idFromName: vi.fn().mockReturnValue("planning-health-probe"),
        get: vi.fn().mockReturnValue({
          fetch: vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({ status: "queued" }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          ),
        }),
      },
      PLAN_ARTIFACTS: {
        list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
      },
      PLAN_EMBEDDINGS: {
        describe: vi.fn().mockResolvedValue({
          dimensions: 1024,
          metric: "cosine",
        }),
      },
      PLANNER: {},
    } as unknown as Env;

    const result = await checkHealth(env);

    expect(result.status).toBe("success");
    expect(result.details?.database.rowCount).toBe(2);
    expect(result.details?.workflow.instanceStatus).toBe("unknown");
    expect(result.details?.planner.agent).toBe("PlannerAgent");
  });

  it("reports failure when a required planning binding is missing", async () => {
    mocks.fromMock.mockResolvedValue([{ value: 0 }]);
    mocks.getAgentByNameMock.mockResolvedValue({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ status: "ok", agent: "PlannerAgent" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    });

    const env = {
      DB: {},
      PLANNING_ORCHESTRATOR: {
        get: vi.fn().mockResolvedValue({
          status: vi.fn().mockResolvedValue({ status: "unknown" }),
        }),
      },
      PLANNING_MONITOR: {
        idFromName: vi.fn().mockReturnValue("planning-health-probe"),
        get: vi.fn().mockReturnValue({
          fetch: vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({ status: "queued" }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          ),
        }),
      },
      PLAN_EMBEDDINGS: {
        describe: vi.fn().mockResolvedValue({
          dimensions: 1024,
          metric: "cosine",
        }),
      },
      PLANNER: {},
    } as unknown as Env;

    const result = await checkHealth(env);

    expect(result.status).toBe("failure");
    expect(result.details?.artifacts.status).toBe("FAILURE");
    expect(result.details?.artifacts.error).toContain("PLAN_ARTIFACTS");
  });
});
