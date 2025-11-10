export interface Env {
  ROOM_DO: DurableObjectNamespace;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  DB: D1Database;
  AI: any;
}

export type RPCMethod = "createTask" | "listTasks" | "runAnalysis";
