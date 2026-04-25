import { Hono } from "hono";
import { getAgentByName } from "agents";

/**
 * @file src/backend/src/ai/workflows/jules-stitch.ts
 * @description The primary integration layer for the 4-agent Jules + Stitch workflow.
 *              Acts as the HTTP endpoint surface that coordinates Design, Orchestrator,
 *              Engineer, and Guardrail agents.
 */

const workflowRouter = new Hono<{ Bindings: Env }>();

workflowRouter.post("/", async (c) => {
  const body = await c.req.json();
  const { prompt, repoContext, projectId } = body;
  
  if (!prompt || !repoContext) {
    return c.json({ error: "prompt and repoContext are required." }, 400);
  }

  try {
    // 1. Invoke DesignAgent to digest user prompt and generate an initial UI/UX concept if needed.
    const designAgent = getAgentByName(c.env.DESIGN_AGENT as any, "singleton");
    const designOutput = await (designAgent as any).chat({ 
      message: `Use Stitch to create: ${prompt}\nProject Context: ${projectId || 'new'}`, 
      model: "gemini-2.5-flash" 
    });

    // 2. Pass flow to Orchestrator to define the component breakdown implementation sprint
    const orchestrator = getAgentByName((c.env as any).ORCHESTRATOR as any, "singleton");
    const { sprint } = await (orchestrator as any).submitRequest(`Implement the generated design for: ${prompt}`, repoContext);

    // 3. Engineer dispatches fleet based on the sprint, passing HTML digests
    const engineer = getAgentByName(c.env.ENGINEER_AGENT as any, "singleton");
    const { sessionIds } = await (engineer as any).assignSprint(sprint);

    return c.json({ 
      success: true, 
      workflowId: crypto.randomUUID(),
      sprint, 
      sessionIds,
      designLog: designOutput 
    });

  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default workflowRouter;
