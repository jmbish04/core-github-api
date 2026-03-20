import { z } from 'zod';
import { Logger } from '@/lib/logger';
import { runAgentStructured, runAgentText } from '@/ai/agents/support/inference';

const RouteSchema = z.object({
  category: z.enum(['billing', 'technical', 'general']),
  reasoning: z.string(),
});

export interface Route {
  id: string;
  description: string;
  handler: string;
}

export abstract class RoutingAgent {
  protected readonly logger: Logger;

  constructor(protected readonly env: Env, loggerNamespace = 'patterns/routing') {
    this.logger = new Logger(env, loggerNamespace);
  }

  protected getRouteInstructions(category: z.infer<typeof RouteSchema>['category']): string {
    switch (category) {
      case 'billing':
        return 'Handle invoices, payments, and billing questions.';
      case 'technical':
        return 'Debug technical issues and explain the likely remediation path.';
      default:
        return 'Provide a helpful general assistant response.';
    }
  }

  async handleRequest(query: string): Promise<{ category: z.infer<typeof RouteSchema>['category']; reasoning: string; response: string }> {
    const route = await runAgentStructured({
      env: this.env,
      logger: this.logger,
      name: `${this.constructor.name}-router`,
      instructions: 'Classify the user input to route it to the correct department.',
      prompt: query,
      schema: RouteSchema,
    });

    const response = await runAgentText({
      env: this.env,
      logger: this.logger,
      name: `${this.constructor.name}-${route.category}`,
      instructions: this.getRouteInstructions(route.category),
      prompt: query,
    });

    return {
      category: route.category,
      reasoning: route.reasoning,
      response,
    };
  }
}
