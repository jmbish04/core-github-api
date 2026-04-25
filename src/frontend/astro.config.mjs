import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import path from "node:path";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
    platformProxy: {
      enabled: true,
      configPath: "../wrangler.jsonc",
    },
  }),
  integrations: [react()],
  outDir: "../../public",
  vite: {
    resolve: {
      alias: {
        "@": path.resolve("./src"),
        "@diceui/timeline": path.resolve("./src/components/ui/diceui/timeline.tsx"),
        "@diceui/kanban": path.resolve("./src/components/ui/diceui/kanban.tsx"),
        "@diceui/stat": path.resolve("./src/components/ui/diceui/stat.tsx"),
        "@api": path.resolve("../backend/src"),
        "@shared": path.resolve("../backend/src/shared"),
        "@db": path.resolve("../backend/src/db"),
      },
    },
  },
});