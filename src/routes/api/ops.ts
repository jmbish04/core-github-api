
import { Hono } from 'hono';
import { Bindings } from '../../utils/hono';

const opsApi = new Hono<{ Bindings: Bindings }>();

// All routes under /api/ops/:id/... are forwarded to the Supervisor DO
opsApi.all('/:id/*', async (c) => {
    const id = c.req.param('id');
    const doId = c.env.SUPERVISOR.idFromName(id);
    const stub = c.env.SUPERVISOR.get(doId);

    // We strip the /api/ops/:id prefix to forward a cleaner URL to the DO
    // e.g. /api/ops/123/websocket -> /websocket
    //      /api/ops/123/chat -> /chat
    const url = new URL(c.req.url);
    const path = url.pathname.replace(`/api/ops/${id}`, '');
    const newUrl = new URL(path, url.origin); // keep origin, change path
    newUrl.search = url.search; // keep query params

    const newReq = new Request(newUrl, c.req.raw);

    return stub.fetch(newReq);
});

// Also handle the exact root /api/ops/:id (e.g. for status check default)
opsApi.all('/:id', async (c) => {
    const id = c.req.param('id');
    const doId = c.env.SUPERVISOR.idFromName(id);
    const stub = c.env.SUPERVISOR.get(doId);

    // Forward as /status by default or let DO handle root
    const newUrl = new URL('/status', c.req.url);
    return stub.fetch(new Request(newUrl, c.req.raw));
});


export default opsApi;
