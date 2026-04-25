/**
 * @file EngineerAgent/methods/sandbox/sessions/types.ts
 * @description Options for bootstrapping a Sandbox container session.
 */


export interface KeepAliveOptions {
  sessionId: string;
  durationSecs?: number;
}

export interface CreateSessionOptions {
  /**
   * Override the GitHub token injected into the sandbox.
   * Defaults to `env.GITHUB_PERSONAL_ACCESS_TOKEN`.
   */
  githubToken?: string;

  /**
   * When true (default), writes a binding-proxy manifest to
   * `/workspace/.colby/bindings.json` inside the sandbox so the
   * container-server can call back to the Worker for D1/KV/R2 access.
   */
  injectBindings?: boolean;

  /**
   * Seconds of inactivity before the container goes idle.
   * Defaults to the value in `env.SANDBOX_SLEEP_AFTER`.
   */
  sleepAfterSecs?: number;
}
