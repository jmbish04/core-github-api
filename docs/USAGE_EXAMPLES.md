# Multi-Protocol GitHub Worker - Usage Examples

This document provides comprehensive examples for using all four protocols supported by this Worker:
- **REST API** - Standard HTTP endpoints
- **WebSocket** - Real-time bidirectional communication
- **RPC** - Direct service binding invocations
- **MCP** - Model Context Protocol for AI tools

## Prerequisites

```bash
# Set your base URL and API key
export BASE_URL="https://your-worker.workers.dev"
export API_KEY="your-api-key-here"
```

---

## 1. REST API Examples

### Search Repositories

```bash
curl -X POST "$BASE_URL/api/octokit/search/repos" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "language:typescript stars:>100",
    "sort": "stars",
    "order": "desc",
    "per_page": 10
  }' | jq
```

### Create or Update a File

```bash
curl -X POST "$BASE_URL/api/tools/files/upsert" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "your-username",
    "repo": "your-repo",
    "path": "src/index.ts",
    "content": "console.log(\"Hello from Worker!\");",
    "message": "Add index.ts",
    "branch": "main"
  }' | jq
```

### Create an Issue

```bash
curl -X POST "$BASE_URL/api/tools/issues/create" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "your-username",
    "repo": "your-repo",
    "title": "Bug: Application crashes on startup",
    "body": "When I start the application, it crashes immediately.",
    "labels": ["bug", "urgent"]
  }' | jq
```

### Create a Pull Request

```bash
curl -X POST "$BASE_URL/api/tools/prs/create" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "your-username",
    "repo": "your-repo",
    "title": "feat: Add new feature",
    "body": "This PR implements the requested feature.",
    "head": "feature-branch",
    "base": "main"
  }' | jq
```

### Create Agent Session

```bash
curl -X POST "$BASE_URL/api/agents/session" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "my-project",
    "searchTerms": ["cloudflare workers", "durable objects"],
    "options": {
      "maxResults": 100
    }
  }' | jq
```

### Get Session Status

```bash
# Replace SESSION_ID with actual session ID from create response
curl -X GET "$BASE_URL/api/agents/session/SESSION_ID" \
  -H "x-api-key: $API_KEY" | jq
```

### Health Check

```bash
curl -X GET "$BASE_URL/healthz" | jq
```

---

## 2. WebSocket Examples

### Browser Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Test</title>
</head>
<body>
  <h1>WebSocket Connection</h1>
  <div id="status">Connecting...</div>
  <div id="messages"></div>
  <input id="input" type="text" placeholder="Type a message...">
  <button onclick="sendMessage()">Send</button>

  <script>
    const projectId = 'my-project';
    const ws = new WebSocket(`wss://your-worker.workers.dev/ws?projectId=${projectId}`);

    ws.onopen = () => {
      document.getElementById('status').textContent = 'Connected!';
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Received:', data);

      const messagesDiv = document.getElementById('messages');
      messagesDiv.innerHTML += `<p><strong>${data.type}:</strong> ${JSON.stringify(data.payload)}</p>`;
    };

    ws.onclose = () => {
      document.getElementById('status').textContent = 'Disconnected';
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    function sendMessage() {
      const input = document.getElementById('input');
      const message = {
        type: 'broadcast',
        payload: {
          text: input.value,
          timestamp: new Date().toISOString()
        }
      };
      ws.send(JSON.stringify(message));
      input.value = '';
    }

    // Ping every 30 seconds to keep connection alive
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', payload: { t: Date.now() } }));
      }
    }, 30000);
  </script>
</body>
</html>
```

### Node.js Example

```javascript
import WebSocket from 'ws';

const projectId = 'my-project';
const ws = new WebSocket(`wss://your-worker.workers.dev/ws?projectId=${projectId}`);

ws.on('open', () => {
  console.log('Connected to WebSocket');

  // Send a test message
  ws.send(JSON.stringify({
    type: 'broadcast',
    payload: {
      text: 'Hello from Node.js!',
      source: 'node',
    },
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received:', message);

  // Respond to specific message types
  if (message.type === 'connected') {
    console.log('Connection confirmed, socket ID:', message.payload.socketId);
  }
});

ws.on('close', () => {
  console.log('Disconnected from WebSocket');
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Keep alive ping
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping', payload: { t: Date.now() } }));
  }
}, 30000);
```

### curl WebSocket Example (using websocat)

```bash
# Install websocat first: https://github.com/vi/websocat
websocat "wss://your-worker.workers.dev/ws?projectId=demo" --protocol json \
  --text <<EOF
{"type":"broadcast","payload":{"text":"Hello from websocat!"}}
EOF
```

---

## 3. RPC Examples (Service Bindings)

### Consumer Worker Configuration

Add to your consumer worker's `wrangler.jsonc`:

```jsonc
{
  "services": [
    {
      "binding": "GITHUB_WORKER",
      "service": "core-github-api",
      "entrypoint": "GitHubWorker"
    }
  ]
}
```

### Consumer Worker TypeScript

```typescript
// Add to your worker's Env interface
interface Env {
  GITHUB_WORKER: Service<GitHubWorker>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Call RPC method directly
    const health = await env.GITHUB_WORKER.health(env);
    console.log('GitHub Worker health:', health);

    // Search repositories
    const searchResults = await env.GITHUB_WORKER.searchRepositories({
      q: 'language:typescript',
      per_page: 10,
    }, env);

    // Upsert a file
    const fileResult = await env.GITHUB_WORKER.upsertFile({
      owner: 'your-username',
      repo: 'your-repo',
      path: 'README.md',
      content: '# Updated README',
      message: 'Update README via RPC',
    }, env);

    // Create an issue
    const issueResult = await env.GITHUB_WORKER.createIssue({
      owner: 'your-username',
      repo: 'your-repo',
      title: 'New issue via RPC',
      body: 'This issue was created via RPC call',
    }, env);

    return Response.json({
      health,
      searchResults,
      fileResult,
      issueResult,
    });
  },
};
```

### Testing RPC via HTTP

```bash
# You can also test RPC via HTTP (convenience endpoint)
curl -X POST "$BASE_URL/rpc" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "searchRepositories",
    "params": {
      "q": "cloudflare workers",
      "per_page": 5
    }
  }' | jq
```

---

## 4. MCP (Model Context Protocol) Examples

### List Available Tools

```bash
curl -X GET "$BASE_URL/mcp-tools" \
  -H "x-api-key: $API_KEY" | jq
```

### Execute a Tool

```bash
# Search repositories
curl -X POST "$BASE_URL/mcp-execute" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "searchRepositories",
    "params": {
      "q": "language:typescript stars:>1000",
      "sort": "stars",
      "per_page": 5
    }
  }' | jq
```

```bash
# Create an issue
curl -X POST "$BASE_URL/mcp-execute" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "createIssue",
    "params": {
      "owner": "your-username",
      "repo": "your-repo",
      "title": "Issue created via MCP",
      "body": "This demonstrates MCP tool execution"
    }
  }' | jq
```

```bash
# Create a session
curl -X POST "$BASE_URL/mcp-execute" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "createSession",
    "params": {
      "projectId": "mcp-test",
      "searchTerms": ["cloudflare workers", "edge computing"]
    }
  }' | jq
```

### Using MCP with AI Agents

```python
# Python example using MCP with an AI agent
import requests
import json

BASE_URL = "https://your-worker.workers.dev"
API_KEY = "your-api-key"

def list_mcp_tools():
    """List all available MCP tools"""
    response = requests.get(
        f"{BASE_URL}/mcp-tools",
        headers={"x-api-key": API_KEY}
    )
    return response.json()

def execute_mcp_tool(tool_name, params):
    """Execute an MCP tool"""
    response = requests.post(
        f"{BASE_URL}/mcp-execute",
        headers={
            "x-api-key": API_KEY,
            "Content-Type": "application/json"
        },
        json={
            "tool": tool_name,
            "params": params
        }
    )
    return response.json()

# Example: Search for repositories
tools = list_mcp_tools()
print(f"Available tools: {len(tools['tools'])}")

result = execute_mcp_tool("searchRepositories", {
    "q": "cloudflare workers",
    "per_page": 10
})
print(f"Search result: {result['result']['total_count']} repositories found")

# Example: Create an issue
issue_result = execute_mcp_tool("createIssue", {
    "owner": "your-username",
    "repo": "your-repo",
    "title": "Automated issue from MCP",
    "body": "This issue was created programmatically via MCP"
})
print(f"Created issue #{issue_result['result']['issue']['number']}")
```

---

## 5. OpenAPI Documentation

### Get OpenAPI JSON (3.1.0)

```bash
curl -X GET "$BASE_URL/openapi.json" | jq > openapi.json
```

### Get OpenAPI YAML (3.1.0)

```bash
curl -X GET "$BASE_URL/openapi.yaml" > openapi.yaml
```

### View Interactive Documentation

Open in your browser:
```
https://your-worker.workers.dev/doc
```

---

## 6. Advanced Examples

### Multi-Protocol Orchestration

```javascript
// Example: Use multiple protocols together
async function orchestratedWorkflow() {
  const baseUrl = 'https://your-worker.workers.dev';
  const apiKey = 'your-api-key';

  // 1. Create a session via REST
  const sessionResponse = await fetch(`${baseUrl}/api/agents/session`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId: 'orchestration-demo',
      searchTerms: ['cloudflare', 'serverless'],
    }),
  });
  const session = await sessionResponse.json();
  console.log('Session created:', session.session.id);

  // 2. Monitor progress via WebSocket
  const ws = new WebSocket(`${baseUrl.replace('https', 'wss')}/ws?projectId=orchestration-demo`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('WebSocket update:', data);
  };

  // 3. Query results via MCP
  const mcpResponse = await fetch(`${baseUrl}/mcp-execute`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool: 'getSessionStatus',
      params: { sessionId: session.session.id },
    }),
  });
  const status = await mcpResponse.json();
  console.log('Session status:', status.result);
}
```

### Load Testing WebSocket

```bash
# Using k6 for WebSocket load testing
k6 run - <<EOF
import ws from 'k6/ws';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const url = 'wss://your-worker.workers.dev/ws?projectId=load-test';

  const res = ws.connect(url, function (socket) {
    socket.on('open', () => {
      console.log('connected');
      socket.send(JSON.stringify({ type: 'ping', payload: { t: Date.now() } }));
    });

    socket.on('message', (data) => {
      console.log('Message received:', data);
    });

    socket.on('close', () => {
      console.log('disconnected');
    });

    socket.setTimeout(() => {
      socket.close();
    }, 10000);
  });

  check(res, { 'status is 101': (r) => r && r.status === 101 });
}
EOF
```

---

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Make sure your API key is correct and passed via `x-api-key` header or `Authorization: Bearer <token>`

2. **WebSocket Connection Failed**:
   - Check that you're using `wss://` (not `ws://`) for production
   - Ensure the `/ws` endpoint is accessible
   - Verify the `ROOM_DO` Durable Object is properly configured

3. **MCP Tool Not Found**:
   - List available tools with `GET /mcp-tools`
   - Ensure tool name matches exactly (case-sensitive)

4. **RPC Method Not Available**:
   - Check that the service binding is configured correctly
   - Verify the entrypoint is set to "GitHubWorker"
   - Ensure the target worker is deployed

### Debug Mode

Enable debug logging by setting the `LOG_LEVEL` environment variable:

```bash
wrangler dev --var LOG_LEVEL:debug
```

---

## Next Steps

- Explore the [OpenAPI documentation](https://your-worker.workers.dev/doc)
- Read the [Architecture Guide](./ARCHITECTURE.md)
- Check out the [Deployment Guide](./DEPLOYMENT.md)
- View the [Cinematic Landing Page](../landing.html)
