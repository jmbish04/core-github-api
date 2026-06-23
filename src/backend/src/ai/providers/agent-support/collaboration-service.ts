import { drizzle } from 'drizzle-orm/d1';
import { eq, desc } from 'drizzle-orm';
import * as schema from '@/db/schemas';

export class CollaborationService {
  constructor(private env: any) {}

  private get db() {
    return drizzle(this.env.DB, { schema });
  }

  async getSessionEvents(sessionId: string) {
    return this.db.query.collaboration_events.findMany({
      where: eq(schema.collaboration_events.sessionId, sessionId),
      orderBy: [desc(schema.collaboration_events.timestamp)]
    });
  }

  async getActiveParticipants(sessionId: string) {
    return this.db.query.collaboration_participants.findMany({
      where: eq(schema.collaboration_participants.sessionId, sessionId)
    });
  }

  async getSessionHistory(agentName: string, limit = 50) {
    return this.db.query.collaboration_participants.findMany({
      where: eq(schema.collaboration_participants.agentName, agentName),
      orderBy: [desc(schema.collaboration_participants.joinedAt)],
      limit
    });
  }
}
