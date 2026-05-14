/**
 * @file services/agentic-session/client.ts
 * @description SessionClient - client-side interface for publishing events,
 *   managing grants, and subscribing to AgenticSession WebSockets.
 */

import { SessionEvent, Permission } from './types';
import { issueSessionToken, verifySessionToken, SessionTokenClaims } from './auth';

export interface SessionClientOptions {
  sessionId: string;
  env: Env;
  userId?: string;
  agentId?: string;
}

/**
 * SessionClient - Provides methods for interacting with AgenticSession DOs
 */
export class SessionClient {
  private sessionId: string;
  private env: Env;
  private subjectId: string;

  constructor(options: SessionClientOptions) {
    this.sessionId = options.sessionId;
    this.env = options.env;
    this.subjectId = options.userId || options.agentId || 'anonymous';
  }

  // ── Publishing Events ────────────────────────────────────────────────

  /**
   * Publishes an event to the session's DO.
   * @param event - SessionEvent to publish
   */
  async publish(event: Omit<SessionEvent, 'sessionId' | 'sequenceNum' | 'timestamp'>): Promise<void> {
    const doId = (this.env.AGENTIC_SESSION_DO as any).idFromName(this.sessionId);
    const doStub = (this.env.AGENTIC_SESSION_DO as any).get(doId);

    const response = await doStub.fetch('http://internal/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to publish event: ${response.status} ${errorText}`);
    }
  }

  // ── Grant Management ─────────────────────────────────────────────────

  /**
   * Grants permissions to a user or agent for this session.
   * @param granteeId - User ID or agent ID
   * @param permissions - Array of permissions (read, write, admin)
   * @param expiresIn - Expiry in seconds (optional)
   */
  async grant(
    granteeId: string,
    permissions: Permission[],
    expiresIn?: number
  ): Promise<void> {
    const doId = (this.env.AGENTIC_SESSION_DO as any).idFromName(this.sessionId);
    const doStub = (this.env.AGENTIC_SESSION_DO as any).get(doId);

    const response = await doStub.fetch('http://internal/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ granteeId, permissions, expiresIn }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to grant permissions: ${response.status} ${errorText}`);
    }
  }

  // ── Subscription ─────────────────────────────────────────────────────

  /**
   * Subscribes an agent or user to this session's WebSocket.
   * Issues a short-lived JWT and connects to the DO.
   * @param permissions - Required permissions (default: ['read'])
   * @returns WebSocket connection
   */
  async subscribeAgent(permissions: Permission[] = ['read']): Promise<WebSocket> {
    // Issue token
    const secret = this.env.SESSION_TOKEN_SECRET as unknown as string;
    const token = await issueSessionToken(
      secret,
      {
        sub: this.subjectId,
        sessionId: this.sessionId,
        permissions,
      },
      3600 // 1h TTL
    );

    // Connect to DO WebSocket
    const doId = (this.env.AGENTIC_SESSION_DO as any).idFromName(this.sessionId);
    const doStub = (this.env.AGENTIC_SESSION_DO as any).get(doId);

    const wsUrl = `http://internal/ws?token=${encodeURIComponent(token)}`;
    const response = await doStub.fetch(wsUrl, {
      headers: { Upgrade: 'websocket' },
    });

    if (response.status !== 101) {
      const errorText = await response.text();
      throw new Error(`WebSocket upgrade failed: ${response.status} ${errorText}`);
    }

    const webSocket = response.webSocket;
    if (!webSocket) {
      throw new Error('WebSocket not returned from DO');
    }

    webSocket.accept();
    return webSocket;
  }

  // ── Query Methods ────────────────────────────────────────────────────

  /**
   * Lists recent events from the session.
   * @param limit - Max events to return (default: 100)
   * @param offset - Pagination offset (default: 0)
   * @returns Array of SessionEvents
   */
  async listEvents(limit: number = 100, offset: number = 0): Promise<SessionEvent[]> {
    const doId = (this.env.AGENTIC_SESSION_DO as any).idFromName(this.sessionId);
    const doStub = (this.env.AGENTIC_SESSION_DO as any).get(doId);

    const url = `http://internal/events?limit=${limit}&offset=${offset}`;
    const response = await doStub.fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list events: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  /**
   * Lists active subscribers to the session.
   * @returns Array of subscriber metadata
   */
  async listSubscribers(): Promise<Array<{ subscriberId: string; subscriberType: string; connectedAt: number }>> {
    const doId = (this.env.AGENTIC_SESSION_DO as any).idFromName(this.sessionId);
    const doStub = (this.env.AGENTIC_SESSION_DO as any).get(doId);

    const response = await doStub.fetch('http://internal/subscribers');

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list subscribers: ${response.status} ${errorText}`);
    }

    return response.json();
  }
}
