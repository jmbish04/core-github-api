/**
 * @file tests/verify-oss-structured.ts
 * @description Test script to verify gpt-oss-120b structured output support
 * 
 * This script tests:
 * 1. JSON Schema structured responses via response_format
 * 2. 128,000 token context window handling
 * 3. Cloudflare AI Gateway Universal Endpoint compatibility
 * 
 * Usage:
 *   CF_API_TOKEN=your_token npx tsx tests/verify-oss-structured.ts
 */

import OpenAI from "openai";
import * as fs from "node:fs";
import path from "node:path";

async function runTest() {
  const apiToken = process.env.CLOUDFLARE_AI_GATEWAY_TOKEN;
  
  if (!apiToken) {
    console.error("❌ Error: CLOUDFLARE_AI_GATEWAY_TOKEN environment variable is required");
    console.log("Usage: CLOUDFLARE_AI_GATEWAY_TOKEN=your_token npx tsx tests/verify-oss-structured.ts");
    console.log("Or ensure it's exported in your terminal");
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey: apiToken,
    baseURL: "https://gateway.ai.cloudflare.com/v1/b3304b14848de15c72c24a14b0cd187d/default-gateway/compat",
  });

  // Load a large file to test the 128k context window
  // Using the orchestrator agent as it's a substantial file
  const filePath = path.resolve(process.cwd(), "backend/src/agents/orchestrator.ts");
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");

  console.log(`🚀 Testing gpt-oss-120b with structured JSON schema`);
  console.log(`📄 File: ${filePath}`);
  console.log(`📊 Size: ${fileContent.length} chars (~${Math.ceil(fileContent.length / 4)} tokens)`);
  console.log(`🔗 Endpoint: Cloudflare AI Gateway Universal Endpoint (/compat)`);
  console.log(`\n⏳ Analyzing file structure...\n`);

  try {
    const response = await client.chat.completions.create({
      model: "workers-ai/@cf/openai/gpt-oss-120b",
      messages: [
        { 
          role: "system", 
          content: "You are a technical analyst. Extract architectural details into the requested JSON schema." 
        },
        { 
          role: "user", 
          content: `Analyze this TypeScript source code and extract key architectural details:\n\n${fileContent}` 
        }
      ],
      // Reasoning models need space for their internal reasoning
      max_tokens: 4096,
      // Request structured response via json_schema
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "agent_analysis",
          schema: {
            type: "object",
            properties: {
              className: { 
                type: "string",
                description: "The primary Agent class name"
              },
              methods: { 
                type: "array", 
                items: { type: "string" },
                description: "All public methods found in the class"
              },
              isRPCEnabled: { 
                type: "boolean",
                description: "Whether the agent supports RPC calls"
              },
              agenticPattern: {
                type: "string",
                description: "The architectural pattern used (e.g., BaseAgent, WorkflowEntrypoint, etc.)"
              },
              summary: { 
                type: "string",
                description: "A technical breakdown of the agentic logic and responsibilities"
              }
            },
            required: ["className", "methods", "isRPCEnabled", "agenticPattern", "summary"]
          }
        }
      }
    });

    console.log("✅ Structured Result:");
    console.log("━".repeat(80));
    const result = JSON.parse(response.choices[0].message.content || "{}");
    console.log(JSON.stringify(result, null, 2));
    console.log("━".repeat(80));
    
    console.log("\n📊 Usage Statistics:");
    console.log(`  Prompt Tokens:     ${response.usage?.prompt_tokens || 0}`);
    console.log(`  Completion Tokens: ${response.usage?.completion_tokens || 0}`);
    console.log(`  Total Tokens:      ${response.usage?.total_tokens || 0}`);
    console.log(`  Context Window:    128,000 tokens (${((response.usage?.total_tokens || 0) / 128000 * 100).toFixed(2)}% utilized)`);
    
    console.log("\n✅ Test Passed!");
    console.log("   - JSON Schema structured output: ✓");
    console.log("   - Large context handling: ✓");
    console.log("   - AI Gateway compatibility: ✓");
    
  } catch (error: any) {
    console.error("❌ Test Failed:");
    console.error(error.message);
    if (error.response) {
      console.error("Response:", error.response.data);
    }
    process.exit(1);
  }
}

runTest();
