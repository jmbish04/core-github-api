/**
 * @file DesignAgent/health.ts
 * @description Health check for the DesignAgent.
 */

import type { DesignAgent } from './index';

export async function healthProbe(agent: DesignAgent) {
  return {
    status: 'ok' as const,
    agent: 'DesignAgent',
    timestamp: new Date().toISOString(),
    capabilities: ['stitch-create', 'stitch-generate', 'stitch-variants'],
  };
}
