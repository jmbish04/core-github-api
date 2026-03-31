import { Hono } from 'hono';

const app = new Hono();
const subApp = new Hono();

subApp.get('/', (c) => c.text('sub root'));
subApp.get('/hello', (c) => c.text('sub hello'));

app.use('/api/sub/*', async (c, next) => {
  const tempApp = new Hono();
  tempApp.route('/api/sub', subApp);
  return tempApp.fetch(c.req.raw, c.env, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
});

// Test
(async () => {
   const req1 = new Request('http://localhost/api/sub/');
   const res1 = await app.fetch(req1);
   console.log('/api/sub/:', await res1.text(), res1.status);

   const req2 = new Request('http://localhost/api/sub/hello');
   const res2 = await app.fetch(req2);
   console.log('/api/sub/hello:', await res2.text(), res2.status);
})();
