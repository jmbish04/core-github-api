const fs = require('fs');
const file = 'backend/src/routes/api/webhooks/jules.ts';
let code = fs.readFileSync(file, 'utf8');

const importStatement = `import { retrofitThreads } from "@db/schemas/agents/retrofit";\n`;
if (!code.includes('import { retrofitThreads }')) {
    code = code.replace('import { eq } from "drizzle-orm";', 'import { eq } from "drizzle-orm";\n' + importStatement);
}

const eventLogic = `

  // Retrofit Agent Webhook Routing
  // If the event is from Jules and we have a corresponding Retrofit thread,
  // wake up the RetrofitAgent DO to handle PR review or merging.
  if (payload.event_type === "ready_for_pr" || payload.event_type === "done") {
    try {
        const [thread] = await db
            .select()
            .from(retrofitThreads)
            .where(eq(retrofitThreads.julesSessionId, payload.jules_session_id))
            .limit(1);

        if (thread) {
            const agentId = c.env.RetrofitAgent.idFromName(thread.id);
            const agentStub = c.env.RetrofitAgent.get(agentId);

            // Invoke the appropriate webhook handler on the DO
            const methodName = payload.event_type === "ready_for_pr" ? "review_pr" : "merge_pr";

            // We use the run-tool convention for Agents SDK or direct fetch if exposed
            // Assuming direct fetch is available or we use the standard RPC
            c.executionCtx.waitUntil(
                agentStub.fetch(\`http://internal/webhook/\${methodName}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(e => console.error("[Retrofit Webhook] Error calling DO:", e))
            );
        }
    } catch (e) {
        console.error("[Retrofit Webhook] Failed to route to RetrofitAgent:", e);
    }
  }
`;

if (!code.includes('// Retrofit Agent Webhook Routing')) {
    // Insert after the session lookup
    code = code.replace(
        'const originalTask = session?.prompt\n    ? session.prompt.substring(0, 120) + "..."\n    : "Unknown task";',
        'const originalTask = session?.prompt\n    ? session.prompt.substring(0, 120) + "..."\n    : "Unknown task";' + eventLogic
    );
    fs.writeFileSync(file, code);
    console.log("Updated jules.ts webhook successfully.");
} else {
    console.log("jules.ts already updated.");
}
