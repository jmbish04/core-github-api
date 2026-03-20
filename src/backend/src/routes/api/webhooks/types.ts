import type { Context } from 'hono';

export interface WebhookHandlerContext {
  c: Context<{ Bindings: Env }>;
  payload: any;
  eventName: string;
  action: string | undefined;
  deliveryId: string;
  repoFullName: string | undefined;
  appId: string | undefined;
  privateKey: string | undefined;
  insertPayload: (table: any, specificFields: any) => Promise<void>;
}
