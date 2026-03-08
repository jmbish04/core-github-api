---
description: Sync Toolbox nav entries when adding new tools
---

## Toolbox Nav Sync

When adding a new tool to `frontend/src/views/control/global/Tools.tsx`:

1. Add a new `<TabsTrigger value="your-tool-slug">` and `<TabsContent value="your-tool-slug">` in `Tools.tsx`.
2. **MANDATORY**: Open `frontend/src/components/layout/AppSidebar.tsx` and add a matching entry to the `toolboxLinks` array:
   ```ts
   { label: 'My New Tool', tab: 'your-tool-slug', icon: SomeIcon }
   ```
   The `tab` value MUST exactly match the TabsTrigger `value` in `Tools.tsx`.
3. Import the icon from `lucide-react` if it is not already imported.

Failing to update the sidebar means the new tool will be unreachable from the main nav.
