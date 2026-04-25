import type { EngineerAgent } from "../index";

export async function handleJulesEvent(agent: EngineerAgent, sessionId: string, status: string, payload: any) {
  // Event sink for when Jules completes, fails, or asks a question
}
