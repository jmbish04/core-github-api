/**
 * @file do/AgenticSessionDO.ts
 * @description Hibernatable WebSocket Durable Object for AgenticSession.
 *   Extends Agent SDK for stateful session management with real-time transparency.
 */

import { DurableObject } from 'cloudflare:workers';
import { getDb } from '@db';
import { z } from 'zod';
import {
  SessionEvent,
  SystemStartEvent,
  SystemCompleteEvent,
  SystemErrorEvent,
  AgentThoughtEvent,
  AgentActionEvent,
  AgentResultEvent,
  HITLRequestEvent,
  HITLResponseEvent,
  JulesStatusEvent,
  JulesEventEvent,
  UserMessageEvent,
} from '@/services/agentic-session/types';
import {
  createSession,
  getSession,
  updateSessionStatus,
  appendEvent,
  getEvents,
  getLatestSequenceNum,
  addSubscriber,
  removeSubscriber,
  updateHeartbeat,
  getActiveSubscribers,
  createGrant,
  checkGrant,
  listGrants,
} from '@/services/agentic-session/d1';
import { verifySessionToken } from '@/services/agentic-session/auth';
import { Logger } from '@/lib/logger';

type Attachment = {
  subscriberId: string;
  subscriberType: 'agent' | 'user' | 'system';
};

/**
 * AgenticSessionDO - Hibernatable WebSocket DO for session transparency.
 * Accepts connections with JWT auth, broadcasts events, and persists to D1.
 */
export class AgenticSessionDO extends DurableObject<Env> {
  private logger: Logger;
  private sequenceCounter: number = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = new Logger(env, 'do/agentic-session');

    // Set up auto ping/pong without waking the object
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade endpoint
    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // Publish event endpoint
    if (url.pathname === '/publish' && request.method === 'POST') {
      return this.handlePublish(request);
    }

    // Grant endpoint
    if (url.pathname === '/grant' && request.method === 'POST') {
      return this.handleGrant(request);
    }

    // List events endpoint
    if (url.pathname === '/events' && request.method === 'GET') {
      return this.handleListEvents(request);
    }

    // List subscribers endpoint
    if (url.pathname === '/subscribers' && request.method === 'GET') {
      return this.handleListSubscribers();
    }

    return new Response('Not found', { status: 404 });
  }

  // ── WebSocket Upgrade ────────────────────────────────────────────────

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response('Missing token', { status: 401 });
    }

    // Verify JWT
    let claims;
    try {
      const secret = this.env.SESSION_TOKEN_SECRET as unknown as string;
      claims = await verifySessionToken(secret, token);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token verification failed';
      await this.logger.error('WebSocket auth failed', { error: message });
      await this.logger.flush();
      return new Response(`Unauthorized: ${message}`, { status: 403 });
    }

    // Extract session ID from DO name
    const sessionId = this.ctx.id.toString();

    // Verify token sessionId matches DO sessionId
    if (claims.sessionId !== sessionId) {
      await this.logger.error('Session ID mismatch', {
        tokenSessionId: claims.sessionId,
        doSessionId: sessionId,
      });
      await this.logger.flush();
      return new Response('Session ID mismatch', { status: 403 });
    }

    // Check grant
    const db = getDb(this.env.DB);
    const hasReadPermission = await checkGrant(db, sessionId, claims.sub, 'read');

    if (!hasReadPermission) {
      await this.logger.error('No grant for subscriber', {
        sessionId,
        subscriberId: claims.sub,
      });
      await this.logger.flush();
      return new Response('No grant for this session', { status: 403 });
    }

    // Accept WebSocket
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const subscriberType = claims.sub.startsWith('agent:') ? 'agent' : 'user';
    const attachment: Attachment = {
      subscriberId: claims.sub,
      subscriberType,
    };

    this.ctx.acceptWebSocket(server, [sessionId]);
    server.serializeAttachment(attachment);

    // Record subscriber in D1
    await addSubscriber(db, {
      sessionId,
      subscriberId: claims.sub,
      subscriberType,
    });

    await this.logger.info('WebSocket accepted', { sessionId, subscriberId: claims.sub });
    await this.logger.flush();

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Publish Event ────────────────────────────────────────────────────

  private async handlePublish(request: Request): Promise<Response> {
    const db = getDb(this.env.DB);
    const sessionId = this.ctx.id.toString();

    let eventData;
    try {
      eventData = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    // Ensure session exists
    let session = await getSession(db, sessionId);
    if (!session) {
      await createSession(db, { id: sessionId });
      session = await getSession(db, sessionId);
    }

    // Get next sequence number
    if (this.sequenceCounter === 0) {
      const latestSeq = await getLatestSequenceNum(db, sessionId);
      this.sequenceCounter = latestSeq + 1;
    } else {
      this.sequenceCounter++;
    }

    // Build full event
    const fullEvent = {
      ...(eventData as Record<string, unknown>),
      sessionId,
      sequenceNum: this.sequenceCounter,
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Validate with Zod
    const result = SessionEvent.safeParse(fullEvent);
    if (!result.success) {
      await this.logger.error('Invalid event schema', {
        errors: result.error.issues,
        event: fullEvent,
      });
      await this.logger.flush();
      return new Response(JSON.stringify({
        error: 'Invalid event schema',
        details: result.error.issues
      }), { status: 400 });
    }

    const validatedEvent = result.data;

    // Persist to D1
    await appendEvent(db, {
      id: crypto.randomUUID(),
      sessionId,
      type: validatedEvent.type,
      payload: validatedEvent.payload as Record<string, unknown>,
      sequenceNum: validatedEvent.sequenceNum,
    });

    // Broadcast to all connected WebSockets
    const payload = JSON.stringify(validatedEvent);
    const sockets = this.ctx.getWebSockets(sessionId);

    let broadcastCount = 0;
    for (const ws of sockets) {
      try {
        ws.send(payload);
        broadcastCount++;
      } catch (error) {
        await this.logger.error('Broadcast failed', { error });
      }
    }

    await this.logger.info('Event published', {
      sessionId,
      type: validatedEvent.type,
      broadcastCount,
    });
    await this.logger.flush();

    return new Response(JSON.stringify({ ok: true, broadcastCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Grant Management ─────────────────────────────────────────────────

  private async handleGrant(request: Request): Promise<Response> {
    const db = getDb(this.env.DB);
    const sessionId = this.ctx.id.toString();

    let grantData;
    try {
      grantData = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const granteeId = (grantData as any).granteeId as string;
    const permissions = (grantData as any).permissions as string[];
    const expiresIn = (grantData as any).expiresIn as number | undefined;

    if (!granteeId || !permissions || !Array.isArray(permissions)) {
      return new Response('Missing granteeId or permissions', { status: 400 });
    }

    const granteeType = granteeId === '*' ? 'wildcard'
      : granteeId.startsWith('agent:') ? 'agent'
      : 'user';

    const expiresAt = expiresIn
      ? Math.floor(Date.now() / 1000) + expiresIn
      : undefined;

    await createGrant(db, {
      id: crypto.randomUUID(),
      sessionId,
      granteeId,
      granteeType,
      permissions,
      expiresAt,
    });

    await this.logger.info('Grant created', { sessionId, granteeId, permissions });
    await this.logger.flush();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── List Events ──────────────────────────────────────────────────────

  private async handleListEvents(request: Request): Promise<Response> {
    const db = getDb(this.env.DB);
    const sessionId = this.ctx.id.toString();
    const url = new URL(request.url);

    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const events = await getEvents(db, sessionId, { limit, offset });

    return new Response(JSON.stringify(events), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── List Subscribers ─────────────────────────────────────────────────

  private async handleListSubscribers(): Promise<Response> {
    const db = getDb(this.env.DB);
    const sessionId = this.ctx.id.toString();

    const subscribers = await getActiveSubscribers(db, sessionId);

    return new Response(JSON.stringify(subscribers), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Hibernatable WebSocket Lifecycle ─────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const parsed = JSON.parse(text) as { type?: string };

      const attachment = ws.deserializeAttachment() as Attachment | null;
      if (!attachment) {
        ws.send(JSON.stringify({ type: 'error', payload: 'Missing attachment' }));
        return;
      }

      // Handle heartbeat
      if (parsed?.type === 'heartbeat') {
        const db = getDb(this.env.DB);
        const sessionId = this.ctx.id.toString();
        await updateHeartbeat(db, sessionId, attachment.subscriberId);
        ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
      }
    } catch (error) {
      await this.logger.error('WebSocket message error', { error });
      await this.logger.flush();
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (attachment) {
      const db = getDb(this.env.DB);
      const sessionId = this.ctx.id.toString();
      await removeSubscriber(db, sessionId, attachment.subscriberId);

      await this.logger.info('WebSocket closed', {
        sessionId,
        subscriberId: attachment.subscriberId,
        code,
        reason,
      });
      await this.logger.flush();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.logger.error('WebSocket error', { error });
    await this.logger.flush();
  }
}
