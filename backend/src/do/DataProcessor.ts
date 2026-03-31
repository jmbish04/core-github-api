import { DurableObject } from "cloudflare:workers";

/**
 * DataProcessor Durable Object
 * Backed by a container as defined in wrangler.jsonc
 */
export class DataProcessor extends DurableObject {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async fetch(request: Request): Promise<Response> {
        return new Response('DataProcessor: not yet implemented', { status: 501 });
    }
}

/**
 * Sandbox Container DO
 * Wrangler container binding class — proxies to the container image defined in wrangler.jsonc.
 */
export class Sandbox extends DurableObject {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async fetch(request: Request): Promise<Response> {
        return new Response('Sandbox: container not running', { status: 503 });
    }
}
