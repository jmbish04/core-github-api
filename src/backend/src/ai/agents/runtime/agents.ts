export function callable(_config?: unknown): any {
  return function (value: any, context?: any, descriptor?: any) {
    if (descriptor) {
      return descriptor;
    }
    return value;
  };
}

type DurableObjectNamespaceLike = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): unknown;
};

export async function getAgentByName(
  namespace: DurableObjectNamespaceLike | undefined,
  name: string,
): Promise<any> {
  if (!namespace) {
    throw new Error('Agent namespace binding is not configured');
  }

  const id = namespace.idFromName(name);
  return namespace.get(id);
}

export async function routeAgentRequest(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const bindingName =
    url.searchParams.get('binding') ||
    request.headers.get('x-agent-binding') ||
    request.headers.get('x-durable-object-binding');
  const threadId =
    url.searchParams.get('threadId') ||
    request.headers.get('x-thread-id') ||
    'default';

  if (!bindingName) {
    return new Response('Missing agent binding name', { status: 400 });
  }

  const namespace = env[bindingName] as DurableObjectNamespace | undefined;
  if (!namespace) {
    return new Response(`Unknown agent binding: ${bindingName}`, { status: 404 });
  }

  const stub = namespace.get(namespace.idFromName(threadId));
  return stub.fetch(request);
}
