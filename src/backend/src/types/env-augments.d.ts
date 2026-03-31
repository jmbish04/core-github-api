/**
 * @file backend/src/types/env-augments.d.ts
 * @description Extends Cloudflare.Env with additional bindings not yet
 * present in the auto-generated worker-configuration.d.ts.
 *
 * These are added manually until `wrangler types` regenerates the file.
 */

declare namespace Cloudflare {
  interface Env {
    /** Vectorize index for sentinel pattern similarity search */
    VECTORIZE_INDEX: VectorizeIndex;

    /** LearningWorkflow binding for triggering the learning pipeline */
    LEARNING_WORKFLOW: Workflow;

    /** LearningAgent Durable Object namespace */
    LEARNING_AGENT: DurableObjectNamespace;
  }
}
