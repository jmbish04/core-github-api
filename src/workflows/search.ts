/**
 * @file src/workflows/search.ts
 * @description This file defines the GithubSearchWorkflow, which is responsible for
 * enqueuing a search task.
 * @owner AI-Builder
 */

// Import the correct base classes and types from 'cloudflare:workers'
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Queue } from 'cloudflare:workers';

// Define the parameters the workflow's run() method will receive
interface GithubSearchWorkflowParams {
  sessionId: string;
  searchId: number;
  searchTerm: string;
}

// Define the bindings the workflow class needs
interface WorkflowBindings {
  SEARCH_QUEUE: Queue;
}

// Export a class named GithubSearchWorkflow that extends WorkflowEntrypoint
export class GithubSearchWorkflow extends WorkflowEntrypoint<WorkflowBindings, GithubSearchWorkflowParams> {
  
  // The run method is the entrypoint for the workflow
  public async run(event: Readonly<WorkflowEvent<GithubSearchWorkflowParams>>, step: WorkflowStep): Promise<void> {
    
    // Get the parameters from the event payload
    const { sessionId, searchId, searchTerm } = event.payload;

    // Use the 'step.do()' helper to perform the enqueue operation.
    // This makes the action retryable and observable by the workflow engine.
    await step.do('enqueue-search-task', async () => {
      if (!this.env.SEARCH_QUEUE) {
        // This error will cause the workflow to fail if the binding is missing
        throw new Error('SEARCH_QUEUE binding not configured for GithubSearchWorkflow');
      }
      
      // Send the task to the queue for the main worker to process
      await this.env.SEARCH_QUEUE.send({
        sessionId,
        searchId,
        searchTerm,
      });
    });
  }
}
