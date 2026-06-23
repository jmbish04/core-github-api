import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import path from "node:path";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
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
