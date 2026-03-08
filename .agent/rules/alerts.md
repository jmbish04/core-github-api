# Rule: Notifications & Alerts

## 1. Zero Native Alerts

- **Forbidden**: You MUST NEVER use the native browser `alert()`, `confirm()`, or `prompt()` functions under any circumstances.
- **Why**: Native alerts break the UI/UX consistency, block the main thread, and violate our \"True Dark\" and premium aesthetic standards.

## 2. Sonner Toasts

- **Required**: For all transient user notifications (success, error, info, loading), you MUST use `toast` from the `sonner` package.
- **Implementation**:
  - `import { toast } from \"sonner\";`
  - Success: `toast.success(\"Message\");`
  - Error: `toast.error(\"Message\");`
  - Generic: `toast(\"Message\");`
- Ensure that the notification is concise and actionable.
