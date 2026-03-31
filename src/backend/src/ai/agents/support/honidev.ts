import { createAgent } from "honidev";
import { z } from "zod";
import { Env } from "../../../types";

export function createBaseAgent(env: Env, name: string, system: string) {
  // Using honidev to create agent
  // Model will be dynamically resolved in production using gateway client
  return createAgent({
    name,
    model: "gpt-4o", // Will be routed through Gateway
    system,
  });
}
