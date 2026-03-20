/**
 * @file src/routes/api/cloudflare/index.ts
 * @description This file aggregates all the Cloudflare-related API routes.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import cloudflareChatApi from '@/routes/api/cloudflare/chat';
import cloudflareDocsAiEditApi from '@/routes/api/cloudflare/docs/ai-edit';
import cloudflareDocsPromptApi from '@/routes/api/cloudflare/docs/prompt';
import cloudflareDocsRevisionsApi from '@/routes/api/cloudflare/docs/revisions';
import cloudflareLogsApi from '@/routes/api/cloudflare/logs';

const cloudflareApi = new OpenAPIHono<{ Bindings: Env }>();

cloudflareApi.route('/', cloudflareChatApi);
cloudflareApi.route('/docs/ai-edit', cloudflareDocsAiEditApi);
cloudflareApi.route('/docs/prompt', cloudflareDocsPromptApi);
cloudflareApi.route('/docs/prompt-revisions', cloudflareDocsRevisionsApi);
cloudflareApi.route('/', cloudflareLogsApi);

export default cloudflareApi;
