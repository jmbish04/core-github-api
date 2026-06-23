# Rule: Exit Criteria & Verification

Before reporting a task or turn as complete, you **MUST**:

1.  **Clear Linting Errors**: Ensure `bun run check` (or checking the IDE output) reveals no linting or compilation errors.
2.  **Verify Deployment**: Run `bun run dry-run` to validate the worker configuration and build process.
    - This executes `wrangler deploy --dry-run` to catch binding issues, bundle size limits, or config errors.
    - **Fix any errors** reported by this command before finishing.
