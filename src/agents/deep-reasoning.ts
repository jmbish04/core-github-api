
import { Agent } from "agents";

interface DeepReasoningInput {
    prompt: string;
    schema: object;
    reasoningParams?: {
        effort?: "low" | "medium" | "high";
        summary?: "auto" | "concise" | "detailed";
    };
}

export class DeepReasoningAgent extends Agent<Env> {
    async fetch(request: Request): Promise<Response> {
        if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
        }

        try {
            const input = (await request.json()) as DeepReasoningInput;
            const { prompt, schema, reasoningParams } = input;

            if (!prompt || !schema) {
                return new Response("Missing prompt or schema", { status: 400 });
            }

            // Step 1: Reasoning with @cf/openai/gpt-oss-120b
            // valid parameters: instructions, input, reasoning: { effort, summary }
            const reasoningResponse = await this.env.AI.run("@cf/openai/gpt-oss-120b", {
                instructions: "You are a deep thinking assistant. Analyze the user's request thoroughly.",
                input: prompt,
                reasoning: {
                    effort: reasoningParams?.effort || "medium",
                    summary: reasoningParams?.summary || "detailed",
                },
            } as any); // Check if type definition needs 'as any' in this env

            const reasoningOutput = (reasoningResponse as any).response || JSON.stringify(reasoningResponse);

            // Step 2: Referencing/Formatting with @cf/meta/llama-3.3-70b-instruct-fp8-fast
            // We instruct it to use the reasoning to fulfill the schema.
            const formattingPrompt = `
      You are a structured data extractor.
      
      User Request: "${prompt}"
      
      Deep Reasoning Context:
      ${reasoningOutput}
      
      Task: transform the above reasoning and request into a valid JSON object matching the following schema.
      `;

            const messages = [
                { role: "system", content: "You are a helpful assistant that outputs strict JSON." },
                { role: "user", content: formattingPrompt },
            ];

            const formatResponse = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
                messages,
                response_format: {
                    type: "json_schema",
                    json_schema: schema
                }
            } as any);

            // Extract the raw string from various potential response formats
            let rawString = "";
            const anyResponse = formatResponse as any;
            if (typeof anyResponse === 'string') {
                rawString = anyResponse;
            } else if (anyResponse.response) {
                rawString = anyResponse.response;
            } else if (anyResponse.choices && anyResponse.choices[0] && anyResponse.choices[0].message) {
                rawString = anyResponse.choices[0].message.content;
            } else {
                rawString = JSON.stringify(formatResponse);
            }

            // Sanitize: Remove markdown code blocks and whitespace
            const jsonStr = rawString.replace(/```json\n?|\n?```/g, "").trim();

            try {
                // Parse to ensure validity before returning
                const parsed = JSON.parse(jsonStr);
                return Response.json(parsed);
            } catch (e) {
                console.error("Failed to parse JSON from Llama:", jsonStr);
                // Fallback: return the raw sanitized string wrapped in an object or error
                return Response.json({ error: "Failed to parse JSON", raw: jsonStr }, { status: 500 });
            }

        } catch (error: any) {
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    }
}
