import { describe, expect, it } from 'vitest';
import { forwardRawEventToMaestro } from '../../src/backend/src/utils/maestro-fanout';

// A body whose exact bytes matter: whitespace and key order that JSON.parse +
// JSON.stringify would normalise away, breaking the HMAC Maestro re-checks.
const RAW = '{ "action":"created",\n  "repository": {"full_name":"jmbish04/x"} }';

function fakeMaestro(status = 200) {
  const calls: Request[] = [];
  return {
    calls,
    env: { MAESTRO: { fetch: async (r: Request) => (calls.push(r), new Response('{}', { status })) } },
  };
}

describe('forwardRawEventToMaestro', () => {
  for (const event of ['repository', 'installation_repositories', 'push']) {
    it(`forwards ${event} byte-for-byte with GitHub's signature headers`, async () => {
      const m = fakeMaestro();
      await forwardRawEventToMaestro(m.env, { event, deliveryId: 'd-1', signature: 'sha256=abc' }, RAW);
      expect(m.calls).toHaveLength(1);
      const req = m.calls[0];
      expect(req.method).toBe('POST');
      expect(new URL(req.url).pathname).toBe('/api/github/webhook');
      expect(req.headers.get('x-github-event')).toBe(event);
      expect(req.headers.get('x-github-delivery')).toBe('d-1');
      expect(req.headers.get('x-hub-signature-256')).toBe('sha256=abc');
      expect(req.headers.get('content-type')).toBe('application/json');
      expect(await req.text()).toBe(RAW);
    });
  }

  for (const event of ['issues', 'pull_request', 'check_run']) {
    it(`does not forward ${event}`, async () => {
      const m = fakeMaestro();
      await forwardRawEventToMaestro(m.env, { event, deliveryId: 'd-2', signature: 'sha256=abc' }, RAW);
      expect(m.calls).toHaveLength(0);
    });
  }

  it('never throws when Maestro errors or is unreachable', async () => {
    await expect(
      forwardRawEventToMaestro(fakeMaestro(401).env, { event: 'push', deliveryId: 'd', signature: 's' }, RAW),
    ).resolves.toBeUndefined();
    const boom = { MAESTRO: { fetch: async () => { throw new Error('down'); } } };
    await expect(
      forwardRawEventToMaestro(boom, { event: 'push', deliveryId: 'd', signature: 's' }, RAW),
    ).resolves.toBeUndefined();
  });
});
