/**
 * Agent utility helpers
 * @module AI/Agents/Utils
 */

/**
 * Get a Durable Object agent stub by namespace and name.
 * Wraps the standard idFromName + get pattern for Cloudflare DO namespaces.
 */
export function getAgentByName(
  namespace: { idFromName(name: string): unknown; get(id: unknown): unknown },
  name: string
): unknown {
  const id = namespace.idFromName(name);
  return namespace.get(id);
}
