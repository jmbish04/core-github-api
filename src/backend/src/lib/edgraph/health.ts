/**
 * @file lib/edgraph/health.ts
 * @description Health checks for the local EDGRAPH service binding and GraphMemory
 */

import { GraphMemory } from 'honidev';
import { HealthStepResult } from '@/health/types';
export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const e = env as any;
  const start = Date.now();
  
  if (!e.EDGRAPH) {
    return {
      name: 'Edgraph Service Binding',
      status: 'failure',
      message: 'EDGRAPH service binding is undefined or not configured',
      durationMs: Date.now() - start
    };
  }

  // WORKER_API_KEY is not a static string, but the user put EDGRAPH_API_KEY
  // Verify the string secret is present
  if (!e.EDGRAPH_API_KEY) {
    return {
      name: 'Edgraph Secret',
      status: 'failure',
      message: 'EDGRAPH_API_KEY string secret is missing',
      durationMs: Date.now() - start
    };
  }

  // We have the setup, let's verify connectivity
  try {
    const graph = new GraphMemory({
      graphId: 'health-check-graph',
      fetcher: e.EDGRAPH as any,
      apiKey: e.EDGRAPH_API_KEY
    });

    const nodeId = `health-check-node-${Date.now()}`;
    
    // 1. Write an ephemeral node
    await graph.upsertNode(nodeId, 'HealthCheck', { timestamp: Date.now() });

    // 2. Read the ephemeral node
    const node = await graph.getNode(nodeId);
    if (!node || node.id !== nodeId) {
      throw new Error(`Failed to retrieve the written node ${nodeId}`);
    }

    // 3. Delete the node
    await graph.deleteNode(nodeId);

    return {
      name: 'Edgraph GraphMemory Connectivity',
      status: 'success',
      message: 'EDGRAPH service connectivity verified (write/read/delete)',
      durationMs: Date.now() - start,
      details: {
        graphId: 'health-check-graph',
        testNode: nodeId
      }
    };
  } catch (e: any) {
    return {
      name: 'Edgraph GraphMemory Connectivity',
      status: 'failure',
      message: e.message || 'Edgraph connectivity check failed',
      durationMs: Date.now() - start,
      details: {
        errorName: e.name,
        errorStack: e.stack,
        errorCause: e.cause
      }
    };
  }
}
