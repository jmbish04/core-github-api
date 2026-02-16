import { Agent, run } from "@openai/agents";
import { Agent as CFAgent, callable } from "agents";

export class ParallelAgent extends CFAgent<Env> {
  
  // Independent workers
  proArguer = new Agent({
    name: "Pro",
    instructions: "Give arguments IN FAVOR of the topic."
  });

  conArguer = new Agent({
    name: "Con",
    instructions: "Give arguments AGAINST the topic."
  });

  synthesizer = new Agent({
    name: "Synthesizer",
    instructions: "Synthesize the provided arguments into a balanced conclusion."
  });

  @callable()
  async debate(topic: string) {
    // 1. Run in parallel
    console.log(`[Parallel] Starting debate on: ${topic}`);
    
    const [proResult, conResult] = await Promise.all([
      run(this.proArguer, topic),
      run(this.conArguer, topic)
    ]);

    const proArgs = proResult.finalOutput;
    const conArgs = conResult.finalOutput;

    // 2. Synthesize
    const finalInput = `
      Topic: ${topic}
      Arguments For: ${proArgs}
      Arguments Against: ${conArgs}
      
      Provide a final verdict.
    `;

    const summaryResult = await run(this.synthesizer, finalInput);
    
    return {
      pro: proArgs,
      con: conArgs,
      verdict: summaryResult.finalOutput
    };
  }
}