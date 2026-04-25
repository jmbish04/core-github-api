# Rule: Webhook Refactor Standards

- Every automation MUST extend `BaseAutomation` and live in its own isolated `.ts` file.
- **Strict Conditional Routing**: The webhook router must NEVER contain conditional `if/else` logic regarding payload traits or repos. It must act strictly as a dumb dispatcher reading from D1, and it MUST call `await instance.shouldExecute()` to let the class decide if it applies to the payload.
- All frontend components must use Shadcn strictly, ensuring the global dark theme is maintained without custom raw CSS.
- The workflow execution logs must always be sorted by `createdAt DESC`.
- **Global Automations**: Use the AutomationArchitect agent via the Workflows Dashboard to rapidly scaffold new automation files and ensure they are added to `AutomationRegistry.ts`.
