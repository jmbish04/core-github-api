# Implement Remote MCP Server on Cloudflare Workers

1. **Context Analysis**: The user is moving away from local `stdio` Node proxies and adopting the official `@cloudflare/agents` SDK utilizing Streamable HTTP for Remote MCP. We must handle the V8 isolate environment mismatch.
2. **Setup Boilerplate**: Initialize an `OpenAPIHono` app. Add strict OpenAPI 3.1.0 documentation definitions and standard operational routes (`/openapi.json`, `/swagger`, `/scalar`, `/health`, `/context`, `/docs`).
3. **McpServer Factory**: Create a `createOurMcpServer(env)` function that instantiates `new McpServer()` from `@modelcontextprotocol/sdk/server/mcp.js`.
4. **Native Ports**:
   - **Assistant-UI**: Port `@assistant-ui/mcp-docs-server` to a native `server.tool(...)` using Zod for parameter validation and returning content as `[{ type: 'text', text: ... }]`.
   - **Sequential Thinking**: Port `@modelcontextprotocol/server-sequential-thinking` to a native tool returning systematic sequences.
5. **Remote Proxies**:
   - **Stitch MCP & Cloudflare Docs**: Register a `remote_mcp_proxy` tool to proxy to remote servers (`https://stitch.googleapis.com/mcp` and `https://docs.mcp.cloudflare.com/mcp`). Establish an `SSEClientTransport` connection. For Stitch, inject `X-Goog-Api-Key` from environment bindings. Return the result safely utilizing `isError: true` on failure.
6. **Route Binding**: Map `app.all('/mcp/*')` to execute `createMcpHandler(server)(c.req.raw, c.env, c.executionCtx)`.
7. **Final Output Check**: Output the full file from imports to exports without truncation.
