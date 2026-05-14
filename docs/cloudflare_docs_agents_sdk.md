Contacting Cloudflare Docs Agent (Session: docs-1776930345536)...

Cloudflare Docs Agent:
Below is a **complete, step‑by‑step guide** to using the Agents SDK for:

1. **Defining callable methods with the `@callable` decorator**  
2. **Making a callable method stream data via Server‑Sent Events (SSE)**  
3. **Calling an agent from another worker (the pattern you posted)**  

All of the information comes directly from the official Cloudflare Agents documentation that was returned in the search results.

---

## 1️⃣ The Agents SDK – Quick Primer  

| Concept | What it is | Where you import it from |
|---------|------------|--------------------------|
| **Agent base class** | Your custom class extends this to gain all SDK features (state, routing, auth, etc.) | `import { Agent } from "agents"` |
| **`@callable` decorator** | Marks a method as an RPC endpoint that a client can invoke with `agent.call()` (or via raw HTTP). | `import { callable } from "agents"` |
| **`StreamingResponse`** | A special object that lets the method push chunks back to the caller, either over the RPC channel **or** as an SSE HTTP response. | `import { StreamingResponse } from "agents"` |
| **`agentFetch` / `getAgentByName`** | Helpers for one‑off HTTP‑style calls to another agent. | `import { agentFetch, getAgentByName } from "agents/client"` |
| **`onRequest`** | Low‑level HTTP handler that runs for every request that reaches the agent (including SSE). | Method on your `Agent` subclass |

---

## 2️⃣ Declaring a Callable Method  

### 2.1 Basic (non‑streaming) RPC  

```ts
import { Agent, callable } from "agents";

export class MyAgent extends Agent {
  // Simple RPC – returns a value once the promise resolves
  @callable()
  async echo(message: string): Promise<string> {
    return `You said: ${message}`;
  }
}
```

### 2.2 Streaming RPC (the preferred way to do SSE)  

The SDK lets you **stream** data directly from a callable method by passing a `StreamingResponse` object as the first argument and marking the method with `@callable({ streaming: true })`.

```ts
import { Agent, callable, StreamingResponse } from "agents";

export class DesignAgent extends Agent {
  /**
   * This method streams a series of fragments back to the caller.
   * The client receives each fragment via the `onChunk` callback
   * (or as an SSE event if it uses the raw HTTP interface).
   */
  @callable({ streaming: true })
  async generateDesign(
    stream: StreamingResponse,
    prompt: string
  ): Promise<void> {
    // Example: a mock LLM that yields chunks
    for await (const chunk of mockLlmStream(prompt)) {
      // Push each chunk immediately
      await stream.write(chunk);
    }

    // Optional: close the stream early with a final payload
    // await stream.end({ done: true });
  }
}

/** Mock async generator – replace with your real model */
async function* mockLlmStream(prompt: string) {
  const parts = [
    `Design idea 1 for "${prompt}"`,
    `Design idea 2 for "${prompt}"`,
    `Design idea 3 for "${prompt}"`,
  ];
  for (const p of parts) {
    await new Promise((r) => setTimeout(r, 500)); // simulate latency
    yield p;
  }
}
```

#### Important compiler / bundler settings  

* **Vite** – If you’re using Vite, you **must** add the agents Vite plugin, otherwise modern TC39 decorators (`@callable`) will not be transformed.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import agents from "agents/vite";

export default defineConfig({
  plugins: [agents(), /* other plugins such as react/cloudflare */],
});
```

* **tsconfig** – Extend the SDK‑provided config (or copy the relevant fields) so the output target is `ES2021` and the experimental TypeScript decorator flag is **not** enabled.

```json
// tsconfig.json
{
  "extends": "agents/tsconfig"
}
```

* **Do NOT set** `"experimentalDecorators": true`. The Agents SDK relies on the **standard TC39 decorators**, and that flag forces the legacy TypeScript decorators, which break `@callable` at runtime.

---

## 3️⃣ Consuming a Streaming Callable from a Client  

### 3.1 Using the **Agents client SDK** (recommended)

```ts
import { getAgentByName } from "agents/client";

async function run() {
  const designAgent = await getAgentByName(
    env.DESIGN_AGENT as any,   // your bound Agent instance name
    runId                      // optional correlation id
  );

  // `call` knows the method is streaming because of the @callable options
  await designAgent.call("generateDesign", ["my cool logo"], {
    onChunk: (chunk) => {
      console.log("Chunk →", chunk);
    },
    onDone: (finalResult) => {
      console.log("✅ Stream finished", finalResult);
    },
    onError: (err) => {
      console.error("❌ Stream error", err);
    },
  });
}
```

* The SDK automatically opens a **WebSocket** (or falls back to HTTP chunked) connection, packages each chunk as a message, and invokes your callbacks.

### 3.2 Using a **raw HTTP fetch** with **Server‑Sent Events**  

If you prefer to speak plain HTTP, your agent can expose an SSE endpoint via `onRequest`. The client can then use `fetch`/`EventSource` exactly as you sketched in the question.

#### Agent side – SSE handler

```ts
import { Agent, StreamingResponse } from "agents";

export class DesignAgent extends Agent {
  // Same generateDesign method as above – reusable for both RPC & SSE
  @callable({ streaming: true })
  async generateDesign(
    stream: StreamingResponse,
    prompt: string
  ): Promise<void> {
    for await (const chunk of mockLlmStream(prompt)) {
      await stream.write(chunk);
    }
  }

  /** HTTP entry point – called for any fetch that reaches the agent */
  async onRequest(request: Request): Promise<Response> {
    // Only treat it as SSE when the client explicitly asks for it
    if (request.headers.get("Accept") === "text/event-stream") {
      // Create a StreamingResponse that will back an SSE stream
      const stream = new StreamingResponse();

      // Start the same generation logic, passing the SSE stream
      const url = new URL(request.url);
      const prompt = url.searchParams.get("prompt") ?? "default";

      // Fire‑and‑forget – the stream writes itself to the response body
      this.generateDesign(stream, prompt).catch((e) => console.error(e));

      // Return a proper SSE response
      return new Response(stream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Fallback – not an SSE request
    return new Response("Unsupported request", { status: 400 });
  }
}
```

#### Client side – raw SSE fetch

```ts
// Using the standard EventSource API (nice for browsers)
const es = new EventSource("http://agent/stream?prompt=my+logo", {
  // The Agents platform will automatically add the authentication token
  // if you use the client SDK's `agentFetch` helper.
});

// Listen for each SSE chunk
es.onmessage = (ev) => {
  console.log("SSE chunk →", ev.data);
};

es.onerror = (err) => {
  console.error("SSE error", err);
  es.close();
};
```

> **Note:** The raw request you wrote in the question  

```ts
const doResponse = await agent.fetch(
  new Request("http://agent/stream", {
    headers: { Accept: "text/event-stream" },
  })
);
```  

* **Works** *if* the agent implements `onRequest` exactly as shown above, and the URL (`/stream`) is routed to that handler.  
* It **bypasses** the higher‑level RPC helpers (`agent.call`) and therefore you must handle token authentication yourself (or use `agentFetch` which injects the JWT automatically).  

In most cases you’ll get fewer pitfalls by using the **client‑side `call` API with streaming**. Only use the raw SSE route if you need a plain HTTP/EventSource consumer (e.g., a third‑party service that cannot use the WebSocket‑based RPC).

---

## 4️⃣ End‑to‑End Example (Putting it All Together)

```ts
// ==== agents/design-agent.ts =========================================
import { Agent, callable, StreamingResponse } from "agents";

export class DesignAgent extends Agent {
  @callable({ streaming: true })
  async generateDesign(
    stream: StreamingResponse,
    prompt: string
  ): Promise<void> {
    for await (const chunk of mockLlmStream(prompt)) {
      await stream.write(chunk);
    }
  }

  async onRequest(request: Request): Promise<Response> {
    if (request.headers.get("Accept") === "text/event-stream") {
      const url = new URL(request.url);
      const prompt = url.searchParams.get("prompt") ?? "";
      const stream = new StreamingResponse();

      // Kick off the same generation logic – it writes to the SSE stream
      this.generateDesign(stream, prompt).catch(console.error);

      return new Response(stream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return new Response("Not an SSE request", { status: 400 });
  }
}

// ==== worker/consumer.ts ============================================
import { getAgentByName } from "agents/client";

export default {
  async fetch(request: Request, env: any) {
    // Example 1 – RPC streaming (preferred)
    const designAgent = await getAgentByName(env.DESIGN_AGENT);
    await designAgent.call("generateDesign", ["logo for ACME"], {
      onChunk: (c) => console.log("[RPC] →", c),
    });

    // Example 2 – raw SSE (optional)
    const sseResp = await designAgent.fetch(
      new Request("http://agent/stream?prompt=logo+for+ACME", {
        headers: { Accept: "text/event-stream" },
      })
    );

    // The response body is a ReadableStream of SSE data
    const reader = sseResp.body?.getReader();
    // … consume the chunks manually if you like

    return new Response("Done", { status: 200 });
  },
};
```

---

## 5️⃣ TL;DR – Is the pattern you posted acceptable?  

| Pattern | Verdict | Why |
|--------|---------|------|
| `await agent.fetch(new Request("http://agent/stream", {headers:{Accept:"text/event-stream"}}))` | **Yes, but only if** `onRequest` returns an SSE response (as shown above) **and** you handle authentication tokens (or use `agentFetch` which adds them). | It is a *plain HTTP* style call; the SDK still supports it, but you lose the convenience of the `call(..., {streaming:true})` helper. |
| Preferred way for streaming | **Use `@callable({ streaming: true })` + `agent.call(..., {onChunk,…})`** | Handles token management automatically, uses WebSocket (or HTTP chunked) under the hood, and gives you reusable client‑side callbacks. |
| Needed build configuration | **Add `agents/vite` plugin** + **extend `agents/tsconfig`** and **do NOT enable `experimentalDecorators`** | Without these, the decorator will throw a `SyntaxError: Invalid or unexpected token`. |

---

## 6️⃣ Quick Checklist for a Working Setup  

1. **Project configuration**  
   * `vite.config.ts` → `plugins: [agents(), …]`  
   * `tsconfig.json` → `"extends": "agents/tsconfig"` (or at least `"target":"ES2021"`).  
   * Ensure **no** `"experimentalDecorators": true`.

2. **Agent code**  
   * Extend `Agent`.  
   * Mark streaming entry points with `@callable({ streaming: true })`.  
   * If you need a raw SSE endpoint, implement `onRequest` that returns a `StreamingResponse` with `Content-Type: text/event-stream`.

3. **Client code**  
   * Use `getAgentByName`/`agentFetch` for one‑off HTTP calls.  
   * Use `agent.call(...,{onChunk,onDone,onError})` for streaming RPC.  
   * If you must use raw SSE, call `fetch` (or `EventSource`) with `Accept: text/event-stream` and read the `ReadableStream` or SSE events.

4. **Authentication**  
   * The SDK injects a short‑lived JWT automatically when you use the client helpers (`agent.call`, `agentFetch`, `getAgentByName`).  
   * For manual `fetch`, add the token yourself (`Authorization: Bearer <jwt>`), or simply use `agent.fetch` which does it for you.

---

### 🎉 You now have everything you need to:

* Write callable methods that **stream** data.  
* Expose those methods via **Server‑Sent Events** if you need plain HTTP.  
* Call another agent from a worker, either via the **high‑level RPC API** or via the **raw SSE fetch** you asked about.  

If you run into any specific error (e.g., the “Invalid or unexpected token” decorator error), double‑check the Vite plugin and tsconfig settings described in section 5. Feel free to reply with the exact error message and we can dig deeper!

Sources (Top 3):

✅ Response saved to clipboard.
