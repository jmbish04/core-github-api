/**
 * @file routes/api/sessions/index.ts
 * @description Re-exports and mounts all AgenticSession sub-routers.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import wsApi from './ws';
import eventsApi from './events';
import subscribersApi from './subscribers';
import grantsApi from './grants';

const sessionsApi = new OpenAPIHono<{ Bindings: Env }>();

// Mount sub-routers
sessionsApi.route('/', wsApi);
sessionsApi.route('/', eventsApi);
sessionsApi.route('/', subscribersApi);
sessionsApi.route('/', grantsApi);

export default sessionsApi;
