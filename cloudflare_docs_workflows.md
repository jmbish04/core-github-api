Contacting Cloudflare Docs Agent (Session: docs-1776928536411)...

Cloudflare Docs Agent:
Below is the full, step‑by‑step context you can hand to your coding agent for creating **Cloudflare Workers Workflows**.  
All of the information comes directly from the Cloudflare Docs snippet you provided.

---

## 1️⃣ Create a new Worker project (using the C3 CLI)

| Command | What it does |
|---------|--------------|
| `npm create cloudflare@latest -- my-workflow` | Starts the C3 (“Create Cloudflare”) wizard and scaffolds a new Worker project called **my‑workflow**. |
| `yarn create cloudflare my-workflow` | Same as above, but using Yarn. |
| `pnpm create cloudflare@latest my-workflow` | Same as above, but using PNPM. |

### Options you should select in the interactive wizard  

| Prompt | Recommended answer |
|--------|--------------------|
| **What would you like to start with?** | `Hello World example` |
| **Which template would you like to use?** | `Worker only` |
| **Which language do you want to use?** | `TypeScript` |
| **Do you want to use git for version control?** | `Yes` |
| **Do you want to deploy your application?** | `No` (you’ll add a workflow first) |

### After the wizard finishes

```bash
cd my-workflow        # enter the newly created directory
```

You’ll see the following files generated:

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Wrangler configuration (JSON with comments). |
| `src/index.ts` | Minimal “Hello World” Worker written in TypeScript. |
| `package.json` | Node dependencies manifest. |
| `tsconfig.json` | TypeScript compiler options. |

---

## 2️⃣ Write your Workflow

The snippet only mentions a placeholder step – “Write your Workflow”.  
At this point you would add a TypeScript class that implements the workflow logic, e.g.:

```ts
// src/my_workflow.ts
export class MyWorkflow {
  // Add workflow methods here
  async run(event: Request): Promise<Response> {
    // Your custom logic…
    return new Response('Workflow executed')
  }
}
```

Save the file (e.g., `src/my_workflow.ts`) and make sure the class name (`MyWorkflow`) matches the name you’ll use in the Wrangler config (see the next section).

---

## 3️⃣ Configure your Workflow in **wrangler.jsonc** (or **wrangler.toml**)

Open the `wrangler.jsonc` file that was created for you and add a **`workflows`** block.  
Below is the exact JSONC example from the documentation:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-workflow",
  "main": "src/index.ts",
  // Set this to today's date
  "compatibility_date": "2026-04-22",
  "observability": {
    "enabled": true
  },
  "workflows": [
    {
      "name": "my-workflow",          // Identifier you’ll use when binding
      "binding": "MY_WORKFLOW",       // The global variable exposed to your Worker
      "class_name": "MyWorkflow"      // Must match the exported class name
    }
  ]
}
```

**Key fields explained**

| Field | Meaning |
|-------|---------|
| `name` | Name of the Worker project (used for routing, deployments, etc.). |
| `main` | Entry‑point file for the Worker (`src/index.ts`). |
| `compatibility_date` | Required by Wrangler; set to the current date (the example uses 2026‑04‑22). |
| `observability.enabled` | Turns on log‑driven observability for the Worker and workflow. |
| `workflows` (array) | One or more workflow definitions. |
| `workflows[].name` | Logical name of the workflow (used when you bind it). |
| `workflows[].binding` | The identifier that will be added to the Worker’s global scope – e.g., `MY_WORKFLOW`. |
| `workflows[].class_name` | The exact exported class name that implements the workflow (`MyWorkflow`). |

### TOML version (if you prefer `.toml`)

If you decide to use a `wrangler.toml` instead of JSONC, the equivalent configuration looks like this:

```toml
"$schema" = "node_modules/wrangler/config-schema.json"
name = "my-workflow"
main = "src/index.ts"
# Set this to today's date
compatibility_date = "2026-04-22"

[observability]
enabled = true

[[workflows]]
name = "my-workflow"
binding = "MY_WORKFLOW"
class_name = "MyWorkflow"
```

Both formats are accepted; pick the one you already have in your project.

---

## 4️⃣ Wire the workflow into your Worker code

After the configuration is in place, Cloudflare will automatically inject a global variable (as defined by `binding`). You can reference it in `src/index.ts`:

```ts
// src/index.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // `env.MY_WORKFLOW` is the workflow instance created from MyWorkflow class
    const result = await env.MY_WORKFLOW.run(request);
    return result;
  },
};

// Define the shape of `env` for TypeScript (optional but helpful)
export interface Env {
  MY_WORKFLOW: {
    // The methods you defined on MyWorkflow must be listed here
    run(request: Request): Promise<Response>;
  };
}
```

Now, when the Worker receives a request, it forwards the request to the workflow’s `run` method.

---

## 5️⃣ Deploy (once you’ve verified the workflow works locally)

```bash
wrangler preview   # optional – test locally / with dev server
wrangler deploy    # publish to Cloudflare
```

Because you selected **“Do you want to deploy your application? – No”** earlier, the project is not automatically deployed after scaffolding. Once your workflow code and configuration are ready, run the commands above.

---

## 📦 Quick Recap for the Coding Agent

1. **Scaffold** a Worker project with the C3 CLI (choose TS, Hello‑World, git, no auto‑deploy).  
2. **Add** a TypeScript class that implements the workflow (`MyWorkflow`).  
3. **Edit** `wrangler.jsonc` (or `wrangler.toml`) → add a `workflows` array with `name`, `binding`, and `class_name`.  
4. **Reference** the workflow via the global variable (`env.MY_WORKFLOW`) inside your Worker’s `fetch` handler.  
5. **Deploy** with Wrangler when ready.

That’s the complete context you need to get a Cloudflare Workers Workflow up and running. Let me know if you need any code examples or deeper details on a specific step!

Sources (Top 3):

✅ Response saved to clipboard.
