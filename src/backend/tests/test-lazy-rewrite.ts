import { Hono } from 'hono';

const app = new Hono();
const sharedApi = new Hono();
const subApp = new Hono();

subApp.get('/', (c) => c.text('sub root'));
subApp.get('/hello', (c) => c.text('sub hello'));

sharedApi.use('/sub/*', async (c, next) => {
  // c.req.path -> /api/sub/hello
  const match = c.req.path.match(/^(\/(api|mcp|a2a)\/sub)/);
  if (match) {
    const tempApp = new Hono();
    tempApp.route(match[1], subApp);
    return tempApp.fetch(c.req.raw, c.env, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
  }
  return next();
});

app.route('/api', sharedApi);
app.route('/mcp', sharedApi);

// Test
(async () => {
   const req1 = new Request('http://localhost/api/sub');
   const res1 = await app.fetch(req1);
   console.log('/api/sub:', await res1.text(), res1.status);

   const req2 = new Request('http://localhost/api/sub/hello');
   const res2 = await app.fetch(req2);
   console.log('/api/sub/hello:', await res2.text(), res2.status);

   const req3 = new Request('http://localhost/mcp/sub/hello');
   const res3 = await app.fetch(req3);
   console.log('/mcp/sub/hello:', await res3.text(), res3.status);
})();
