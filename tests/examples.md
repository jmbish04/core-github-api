# REST
curl -sX POST http://127.0.0.1:8787/api/tasks -H 'content-type: application/json' -d '{"title":"demo"}' | jq

curl -s "http://127.0.0.1:8787/api/tasks" | jq

# MCP
curl -s "http://127.0.0.1:8787/mcp/tools" | jq
curl -sX POST "http://127.0.0.1:8787/mcp/execute" -H 'content-type: application/json' -d '{"tool":"runAnalysis","params":{"taskId":"00000000-0000-4000-8000-000000000000","depth":2}}' | jq

# RPC (HTTP harness)
curl -sX POST "http://127.0.0.1:8787/rpc" -H 'content-type: application/json' -d '{"method":"createTask","params":{"title":"fromRPC"}}' | jq

# WS (browser console)
const ws = new WebSocket(`ws://127.0.0.1:8787/ws?projectId=demo`);
ws.onmessage = e => console.log('msg', e.data);
ws.onopen = () => ws.send(JSON.stringify({ type: "ping", t: Date.now() }));

# Health and Testing
curl -s "http://127.0.0.1:8787/api/health" | jq
curl -sX POST "http://127.0.0.1:8787/api/tests/run" | jq
curl -s "http://127.0.0.1:8787/api/tests/latest" | jq
curl -s "http://127.0.0.1:8787/api/tests/defs" | jq
