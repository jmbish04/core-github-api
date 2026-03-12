import { Container } from "@cloudflare/containers";

export class Sandbox extends Container {
  // Pass requests to this port by default, including WebSockets
  defaultPort = 8080;

  // 💡 Automatically put the container to sleep after 10 minutes of inactivity
  sleepAfter = "10m"; 

  // Pass environment variables to the container instances
  envVars = {
    NODE_ENV: "production",
  };

  // Hook triggered when the container is cold-started
  async onStart() {
    console.log("Sandbox container starting up...");
  }

  // Hook triggered when sleepAfter expires or SIGTERM is sent
  async onStop() {
    // ⚠️ CRITICAL: The disk is ephemeral. 
    // Save any generated files or SQLite artifacts to R2 or D1 here before the container sleeps.
    console.log("Sandbox container going to sleep (Scale to Zero).");
  }

  // Hook triggered on fatal errors or OOM
  async onError(error: Error) {
    console.error("Sandbox container crashed:", error);
  }
}
