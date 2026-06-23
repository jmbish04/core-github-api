import { OpenAPIHono } from '@hono/zod-openapi';

import shadcnRegistry from './shadcn-registry';

const app = new OpenAPIHono<{ Bindings: Env }>();

app.route('/shadcn-registry', shadcnRegistry);

export default app;
