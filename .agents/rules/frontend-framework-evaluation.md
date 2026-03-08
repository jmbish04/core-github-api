---
trigger: always_on
---

# Frontend Framework Evaluation Rule

When working in `frontend/`, agents must inspect the existing Astro + React island implementation before generating code.

- Review the surrounding feature components and the shared Shadcn primitives in `frontend/src/components/ui`.
- Match the repository's default dark theme tokens and spacing patterns instead of introducing a parallel visual system.
- Keep interactive experiences inside React components that fit the current Astro-hosted structure.
- Validate the resulting UI against the existing frontend before considering the task complete.
