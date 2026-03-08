const fs = require('fs');
const file = 'backend/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

// The route /api/agents/retrofit
const routeLogic = `

// Route for Retrofit Agent
app.all("/api/agents/retrofit/*", (c) => {
  const url = new URL(c.req.url);
  // Default thread or pass via header
  const idStr = c.req.header("x-agent-thread-id") || "default-retrofit-thread";
  const id = c.env.RetrofitAgent.idFromName(idStr);
  const stub = c.env.RetrofitAgent.get(id);

  const newUrl = new URL(c.req.url);
  newUrl.pathname = newUrl.pathname.replace("/api/agents/retrofit", "");
  return stub.fetch(new Request(newUrl.toString(), c.req.raw));
});
`;

if (!code.includes('/api/agents/retrofit/*')) {
    code += routeLogic;
    fs.writeFileSync(file, code);
    console.log("Updated index.ts router successfully.");
} else {
    console.log("index.ts already updated.");
}
