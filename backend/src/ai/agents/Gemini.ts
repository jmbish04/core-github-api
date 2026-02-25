import { Agent as CFAgent, callable } from "agents";
import { LlmAgent, InMemoryRunner } from "@google/adk";

/**
 * @class CloudflareADKAgent
 * @extends CFAgent<Env, any>
 * @description A Durable Object Agent running Google ADK. 
 * Reroutes ADK's native inference engine through Cloudflare AI Gateway 
 * to utilize the @cf/openai/gpt-oss-120b open-weight model via the OpenAI compat endpoint.
 */
export class GeminiAgent extends CFAgent<Env, any> {
  initialState = {
    messages: [] as Array<{ role: string; content: string }>,
    status: "idle",
  };

  private doId: string;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.doId = state.id.toString();
  }

  @callable()
  async chat(prompt: string, history?: any[]) {
    // 1. Construct the Cloudflare AI Gateway OpenAI-Compatible URL
    const accountId = await this.env.CLOUDFLARE_ACCOUNT_ID.get();
    const gateway = this.env.AI_GATEWAY_NAME;
    const apiKey = await this.env.CLOUDFLARE_API_TOKEN.get();
    
    const baseURL = await this.env.AI.gateway(gateway).getUrl('worker-ai');

    // 2. Hijack the global process environment to reroute ADK's underlying fetcher
    (globalThis as any).process = { 
      env: { 
        OPENAI_API_KEY: apiKey,
        OPENAI_BASE_URL: baseURL
      } 
    };

    try {
      this.setState({ ...this.state, status: "running" });

      // 3. Initialize ADK with the Cloudflare Workers AI Model
      const agent = new LlmAgent({
        name: "cf_gateway_agent",
        model: "@cf/openai/gpt-oss-120b", 
        instruction: "You are an elite autonomous agent powered by Cloudflare Workers AI and Google ADK. Provide structured, highly accurate responses.",
      });

      // 4. Setup the ADK InMemoryRunner
      const runner = new InMemoryRunner({ agent, appName: "astro-cf-stack" });
      
      const eventStream = runner.runAsync({
        userId: "user",
        sessionId: this.doId,
        newMessage: { role: "user", parts: [{ text: prompt }] },
      });

      let fullResponse = "";
      
      // 5. Accumulate the full response
      for await (const event of eventStream) {
        if (event.content?.parts) {
          for (const part of event.content.parts) {
            if (part.text) {
              fullResponse += part.text;
            }
          }
        }
      }

      // 6. Persist the state durably
      this.setState({
        messages: [
          ...this.state.messages,
          { role: "user", content: prompt },
          { role: "assistant", content: fullResponse }
        ],
        status: "idle"
      });

      return { response: fullResponse };

    } catch (error: any) {
      this.setState({ ...this.state, status: "error" });
      return { response: `[Agent Error]: ${error.message}` };
    }
  }
}