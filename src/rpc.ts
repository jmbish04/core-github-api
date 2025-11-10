import { z } from "zod";
import * as S from "./schemas/apiSchemas";
import type { Env, RPCMethod } from "./types";

const createTask = async (params: unknown) => {
  const input = S.CreateTaskRequest.parse(params);
  const task = {
    id: crypto.randomUUID(),
    title: input.title,
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };
  return { success: true as const, task };
};

const listTasks = async () => {
  // In a real application, you would fetch this from a database.
  return { success: true as const, tasks: [] };
};

const runAnalysis = async (params: unknown) => {
  const input = S.AnalysisRequest.parse(params);
  // In a real application, you would perform some analysis.
  return { success: true as const, report: { taskId: input.taskId, score: 0.82, notes: "ok" } };
};

export const rpcRegistry = {
  createTask,
  listTasks,
  runAnalysis,
};

export async function dispatchRPC(method: string, params: unknown, env: Env, ctx: ExecutionContext) {
  if (!(method in rpcRegistry)) {
    throw new Error(`Unknown method: ${method}`);
  }
  // @ts-expect-error - We've already checked if the method exists.
  return await rpcRegistry[method](params, env, ctx);
}
