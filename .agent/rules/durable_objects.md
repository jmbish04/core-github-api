# Rule: Durable Object & Agent Migration Strategy

## 1. Definition

- **Requirement**: All new Agents and Durable Objects must be explicitly defined in `durable_objects.bindings`.
- **Constraint**: ALL new classes must be registered in the `migrations` block of `wrangler.jsonc`.

## 2. Deployment Lifecycle Rules

### A. Fresh Deployment (Never Deployed)

- If the worker has **never** been deployed to production, you MAY add new classes to `migrations.v1`.

### B. Standard Deployment (Already Live)

- If the worker **has** been deployed, you **MUST** create a new migration version (e.g., `v2` -> `v3`).
- **Forbidden**: Do NOT add new classes to existing/previous migration tags (e.g., do not retroactively add to `v1`).

## 3. Configuration Format

- **Field**: Always use `new_sqlite_classes` for Agents/DOs.
- **Documentation**: Use a docstring comment to explain the purpose of the new class.

### Example

```jsonc
"migrations": [
  {
    "tag": "v1",
    "new_sqlite_classes": ["ExistingAgent"]
  },
  {
    "tag": "v2",
    "new_sqlite_classes": [
      // Specialized agent for handling X
      "NewSpecializedAgent"
    ]
  }
]
```

## 4. Checklist

1. [ ] Defined in `durable_objects.bindings`?
2. [ ] Added to `migrations`?
3. [ ] Is the migration tag incremented (if live)?
4. [ ] Is the class name docstringed?
