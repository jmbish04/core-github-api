import { Agent, routeAgentRequest, callable } from "agents";
import { jules } from "@google/jules-sdk";

type State = { 
  julesSessionId: string | null;
  status: 'IDLE' | 'MONITORING' | 'COMPLETED' | 'FAILED';
};

export class OverseerAgent extends Agent<Env, State> {
  initialState: State = { julesSessionId: null, status: 'IDLE' };

  // 1. Kick off the Jules Task
  @callable()
  async startTask(prompt: string, source: any) {
    if (this.state.status === 'MONITORING') {
       throw new Error("Already monitoring an active task.");
    }

    console.log("Starting new Jules session...");
    const session = await jules.session({ 
      prompt, 
      source,
      autoPr: true 
    });

    // Save the Session ID to Durable SQLite State
    this.setState({ 
      julesSessionId: session.id, 
      status: 'MONITORING' 
    });

    // Set an alarm to wake up this Durable Object every 15 seconds
    await this.scheduleEvery(15, "monitorJules");
    
    return { sessionId: session.id };
  }

  // 2. The Async Monitor (Wakes up via Durable Alarms)
  async monitorJules() {
    if (this.state.status !== 'MONITORING' || !this.state.julesSessionId) {
      return; // Stop monitoring if we're done
    }

    const session = jules.session(this.state.julesSessionId);
    
    // Check where Jules is currently sitting
    const info = await session.info();
    console.log(`[Overseer] Jules State: ${info.state}`);

    switch (info.state) {
      case 'AWAITING_PLAN_APPROVAL':
        console.log("[Overseer] Jules mapped out a plan. Approving natively...");
        await session.approve();
        break;

      case 'AWAITING_USER_FEEDBACK':
      case 'PAUSED':
      case 'FAILED':
        console.log(`[Overseer] Jules is blocked (${info.state}). Intervening!`);
        
        // 1. Read what Jules just said (using the local select cache)
        const messages = await jules.select({
          from: 'activities',
          where: { type: 'agentMessaged', sessionId: this.state.julesSessionId },
          order: 'desc',
          limit: 1 // Get the last question Jules asked
        });

        const julesLastQuestion = messages[0]?.message || "No message found.";
        
        // 2. AI reasons about how to unblock Jules
        // (You would plug in an LLM call here, e.g. using `runAi` or `env.AI`)
        const computedFeedback = `Go ahead and proceed with the remaining files.`; 
        
        // 3. Kick Jules back into gear
        console.log(`[Overseer] Responding to Jules: ${computedFeedback}`);
        await session.ask(computedFeedback);
        break;

      case 'COMPLETED':
        console.log("[Overseer] Jules finished the task!");
        this.setState({ status: 'COMPLETED' });
        // The scheduleEvery stops mattering if the state changes logic skips it, 
        // but typically you cancel the alarm or ignore future calls.
        break;
    }
  }
}

export default {
  fetch(request: Request, env: Env) {
    return routeAgentRequest(request, env) ?? new Response("Not found", { status: 404 });
  }
};
