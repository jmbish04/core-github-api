# Rule: Cloudflare Agents SDK & WebSockets

## Context
When building stateful WebSocket hubs or persistent actors, we strictly use the official Cloudflare Agents SDK (`agents` package) rather than bare `DurableObject` classes. This provides a unified API for connections, tagging, and protocol management.

## Core Directives

### 1. Extensibility
All stateful WebSocket services MUST extend `Agent<Env>` (from `"agents"`) instead of `DurableObject<Env>`.

### 2. Defense-in-Depth Authentication
Validate WebSocket connections in **both**:
1. **The Edge Route (Hono)**: The primary gate. Validate credentials (e.g., query params or headers) before invoking the Agent.
2. **The Agent (`onConnect`)**: Defense-in-depth. Re-validate the credentials inside the Agent's `onConnect` hook.
   - If unauthorized, immediately close the connection with a 4xxx close code: `connection.close(4001, "Unauthorized");`

### 3. Protocol Message Suppression
By default, the Agent SDK automatically sends `cf_agent_identity`, `cf_agent_state`, and `cf_agent_mcp_servers` JSON frames upon connection. For custom-protocol hubs that don't expect these (e.g., streaming structured payloads directly to a raw parse hook), you MUST override `shouldSendProtocolMessages`:

```ts
shouldSendProtocolMessages(connection: Connection, ctx: ConnectionContext): boolean {
  return false;
}
```

### 4. Connection Tagging & Filtering
- Use `getConnectionTags(connection, ctx)` to assign tags to a WebSocket up to **9 tags, max 256 chars each**.
- To retrieve connections by tag for filtered broadcasting, use `this.getConnections(tag)` rather than the raw DO API `this.ctx.getWebSockets(tag)`.

### 5. Fan-out Broadcasting
- **Global Fan-out**: Use `this.broadcast(msg)` or iterate over `this.getConnections()` to send to all connections.
- **Filtered Fan-out**: Iterate over the `Iterable<Connection>` returned by `this.getConnections(tag)` and call `conn.send()`. Ensure deduplication if sending to multiple tags sequentially, as a single `Connection` ID may exist in multiple tag sets.

### 6. Singleton Routing
To route to a singleton Agent properly, use `getAgentByName` instead of manually handling `idFromName` and raw `fetch` creation when calling from Hono edge handlers:

```ts
// Good
const agent = await getAgentByName(env.BINDING as any, "singleton-name");
return agent.fetch(c.req.raw);

// Bad (legacy Durable Object invocation)
const id = env.BINDING.idFromName("singleton-name");
const stub = env.BINDING.get(id);
return stub.fetch(...);
```

### 7. Avoid Raw DO APIs
Never mix raw DO APIs (`this.ctx.getWebSockets`) with Agent SDK APIs (`this.getConnections`, `Connection`). Once you extend `Agent`, use SDK primitives exclusively.
