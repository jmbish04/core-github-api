import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import path from "node:path";

export default defineConfig({
  integrations: [react()],
  outDir: "../../public",
  vite: {
    resolve: {
      alias: {
        "@": path.resolve("./src"),
        "@diceui/timeline": path.resolve("./src/components/ui/diceui/timeline.tsx"),
        "@diceui/kanban": path.resolve("./src/components/ui/diceui/kanban.tsx"),
        "@diceui/stat": path.resolve("./src/components/ui/diceui/stat.tsx"),
      },
    },
  },
});
