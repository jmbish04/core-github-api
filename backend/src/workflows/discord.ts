/**
 * @file workflows/discord.ts
 * @description DiscordResearchWorkflow — incremental scanner for the
 * Cloudflare Developers Discord.
 *
 * How it works
 * ────────────
 * 1. Authenticate with the Discord API using the bot token from Secrets Store.
 * 2. List every guild (server) the bot belongs to and fetch all text channels.
 * 3. For each channel, query D1 (`discord_scan_log`) to find the ID of the
 *    last message we already processed.
 * 4. Fetch only new messages (after that last ID) from the Discord API.
 * 5. Persist every new message to `discord_messages` (deduplication is handled
 *    by the PRIMARY KEY on the Discord message Snowflake ID).
 * 6. Run a batch AI analysis pass that scores and summarises each message
 *    according to its channel category:
 *      - "what-i-built"  → highlight interesting apps/projects
 *      - "announcement"  → surface new Cloudflare products / updates
 *      - "binding"       → extract developer tips, patterns, gotchas
 *      - "general"       → flag notable discussions
 * 7. Persist high-scoring messages (≥ 60/100) as `research_candidates` so
 *    they flow through the same HITL review loop as GitHub findings.
 * 8. Update `discord_scan_log` for every scanned channel.
 * 9. Return a structured digest that the scheduled handler includes in the
 *    daily newsletter email.
 */

import { drizzle } from "drizzle-orm/d1";
import { eq, and, desc } from "drizzle-orm";
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { createId } from "@paralleldrive/cuid2";
import { discordScanLog, discordMessages } from "@/db/schemas/discord";
import { researchCandidates, researchBriefs } from "@/db/schemas/github/research";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DiscordResearchPayload = {
  /** Optional: restrict scanning to a single guild ID. */
  guildId?: string;
  /** Optional: restrict scanning to a single channel ID. */
  channelId?: string;
  /** If true, skip the AI analysis pass (useful for a dry-run ingestion). */
  skipAnalysis?: boolean;
  /** Brief ID to associate findings with (created internally when absent). */
  briefId?: string;
};

type DiscordGuild = { id: string; name: string };
type DiscordChannel = {
  id: string;
  name?: string | null;
  type: number;
  guild_id?: string;
  topic?: string | null;
};
type DiscordMessage = {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
  author?: { id: string; username: string; bot?: boolean };
};

type ChannelCategory = "what-i-built" | "announcement" | "binding" | "general";

type DiscordDigestItem = {
  messageId: string;
  channelName: string;
  category: ChannelCategory;
  author: string;
  content: string;
  aiScore: number;
  aiSummary: string;
  discordTimestamp: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal Discord REST v10 client. */
class DiscordClient {
  private readonly base = "https://discord.com/api/v10";

  constructor(private readonly token: string) {}

  private async req<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: {
        Authorization: `Bot ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "DiscordBot (https://cloudflare.com, 1.0.0)",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[Discord ${res.status}] ${path}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  getGuilds(): Promise<DiscordGuild[]> {
    return this.req("/users/@me/guilds");
  }

  getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    return this.req(`/guilds/${guildId}/channels`);
  }

  /**
   * Fetches up to `limit` messages AFTER `afterId` (exclusive).
   * Discord returns messages newest-first, so we reverse to get chronological order.
   */
  async getChannelMessagesSince(
    channelId: string,
    afterId: string | null,
    limit = 100
  ): Promise<DiscordMessage[]> {
    const qs = afterId
      ? `?after=${afterId}&limit=${limit}`
      : `?limit=${limit}`;
    const messages = await this.req<DiscordMessage[]>(
      `/channels/${channelId}/messages${qs}`
    );
    // Discord returns newest first; reverse so we process oldest → newest
    return messages.reverse();
  }
}

/** Map a channel name to a broad content category. */
function classifyChannel(name: string): ChannelCategory {
  const n = name.toLowerCase();
  if (n.includes("what-i-built") || n.includes("showcase") || n.includes("show-and-tell")) {
    return "what-i-built";
  }
  if (n.includes("announce") || n.includes("release") || n.includes("changelog")) {
    return "announcement";
  }
  // Cloudflare binding-specific channels
  if (
    n.includes("d1") ||
    n.includes("kv") ||
    n.includes("r2") ||
    n.includes("container") ||
    n.includes("worker") ||
    n.includes("pages") ||
    n.includes("ai") ||
    n.includes("queue") ||
    n.includes("durable-object") ||
    n.includes("stream") ||
    n.includes("email") ||
    n.includes("image") ||
    n.includes("cache")
  ) {
    return "binding";
  }
  return "general";
}

/** Build a compact scoring prompt tailored to the channel category. */
function buildScoringPrompt(
  category: ChannelCategory,
  channelName: string,
  messages: Array<{ id: string; content: string; author: string }>
): string {
  const categoryContext: Record<ChannelCategory, string> = {
    "what-i-built":
      "You are evaluating developer showcase messages. Score highly if the message describes a real, interesting, or creative application built with Cloudflare Workers, Pages, or related products. Ignore spam, off-topic content, or messages without substance.",
    announcement:
      "You are evaluating Cloudflare announcements. Score highly if the message describes a new product, meaningful update, deprecation, or developer-relevant change. Ignore minor fixes or irrelevant posts.",
    binding:
      "You are evaluating developer discussions in a Cloudflare product/binding channel. Score highly if the message contains an actionable tip, trick, pattern, workaround, or useful code snippet. Ignore simple questions with no answer, or off-topic content.",
    general:
      "You are evaluating general developer community messages. Score highly if the message contains genuine insight, a notable technical discussion, or broadly useful information for Cloudflare developers.",
  };

  const messageDump = messages
    .slice(0, 20) // cap context to avoid blowing the prompt
    .map((m) => `[ID:${m.id}] @${m.author}: ${m.content.substring(0, 400)}`)
    .join("\n---\n");

  return `${categoryContext[category]}

Channel: #${channelName}

Evaluate each message below and return ONLY valid JSON in this exact format:
{
  "results": [
    { "id": "<message_id>", "score": <0-100>, "summary": "<one sentence summary>" }
  ]
}

Do NOT include any markdown or explanation — only the JSON object.

Messages:
${messageDump}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function (also callable directly from the scheduled handler)
// ─────────────────────────────────────────────────────────────────────────────

export async function runDiscordResearch(
  env: any,
  payload: DiscordResearchPayload = {}
): Promise<{ status: string; ingested: number; highlighted: number; digest: DiscordDigestItem[] }> {
  console.log("[Discord] Starting Discord research scan…");
  const db = drizzle(env.DB);

  // 1. Auth ──────────────────────────────────────────────────────────────────
  const token: string = await env.DISCORD_TOKEN.get();
  const discord = new DiscordClient(token);

  // 2. Discover guilds & channels ─────────────────────────────────────────────
  const guilds = await discord.getGuilds();
  const targetGuilds = payload.guildId
    ? guilds.filter((g) => g.id === payload.guildId)
    : guilds;

  if (targetGuilds.length === 0) {
    console.warn("[Discord] Bot has no accessible guilds (or guild not found).");
    return { status: "no_guilds", ingested: 0, highlighted: 0, digest: [] };
  }

  // 3. Build list of channels to process ────────────────────────────────────
  type ChannelMeta = DiscordChannel & { guildId: string; guildName: string; category: ChannelCategory };
  const channelsToProcess: ChannelMeta[] = [];

  for (const guild of targetGuilds) {
    let channels: DiscordChannel[] = [];
    try {
      channels = await discord.getGuildChannels(guild.id);
    } catch (err) {
      console.error(`[Discord] Could not fetch channels for guild ${guild.id}:`, err);
      continue;
    }

    // Only text channels (type 0) and forum channels (type 15)
    const textChannels = channels.filter((ch) => ch.type === 0 || ch.type === 15);

    for (const ch of textChannels) {
      if (payload.channelId && ch.id !== payload.channelId) continue;
      channelsToProcess.push({
        ...ch,
        guildId: guild.id,
        guildName: guild.name,
        category: classifyChannel(ch.name ?? ""),
      });
    }
  }

  console.log(`[Discord] Processing ${channelsToProcess.length} channel(s).`);

  // 4. Scan each channel ────────────────────────────────────────────────────
  let totalIngested = 0;
  const allNewMessages: Array<typeof discordMessages.$inferInsert & { category: ChannelCategory }> = [];

  for (const ch of channelsToProcess) {
    // 4a. Check D1 for the last scan state
    const [scanState] = await db
      .select()
      .from(discordScanLog)
      .where(eq(discordScanLog.channelId, ch.id))
      .limit(1);

    const lastMessageId = scanState?.lastMessageId ?? null;

    // 4b. Fetch new messages from Discord
    let newMessages: DiscordMessage[] = [];
    try {
      newMessages = await discord.getChannelMessagesSince(ch.id, lastMessageId, 100);
    } catch (err) {
      console.warn(`[Discord] Could not fetch messages for channel ${ch.id} (${ch.name}):`, err);
      continue;
    }

    // Filter out bot messages and empty content
    const humanMessages = newMessages.filter(
      (m) => m.content.trim().length > 10 && !m.author?.bot
    );

    if (humanMessages.length === 0) {
      console.log(`[Discord] No new messages in #${ch.name ?? ch.id}`);
      // Still update the scan log timestamp so we don't always re-check from null
      await db
        .insert(discordScanLog)
        .values({
          guildId: ch.guildId,
          channelId: ch.id,
          channelName: ch.name ?? null,
          lastMessageId: lastMessageId,
          lastScannedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: discordScanLog.channelId,
          set: {
            lastScannedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      continue;
    }

    // 4c. Persist new messages (dedup by PK)
    const rows = humanMessages.map((m) => ({
      id: m.id,
      guildId: ch.guildId,
      channelId: ch.id,
      channelName: ch.name ?? null,
      authorId: m.author?.id ?? null,
      authorUsername: m.author?.username ?? null,
      content: m.content,
      discordTimestamp: m.timestamp,
      category: ch.category,
      analysed: false as boolean,
    }));

    await db.insert(discordMessages).values(rows).onConflictDoNothing();
    totalIngested += humanMessages.length;
    allNewMessages.push(...rows);

    // 4d. Update scan log — record the ID of the newest message
    const newestId = humanMessages[humanMessages.length - 1].id;
    await db
      .insert(discordScanLog)
      .values({
        guildId: ch.guildId,
        channelId: ch.id,
        channelName: ch.name ?? null,
        lastMessageId: newestId,
        lastScannedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: discordScanLog.channelId,
        set: {
          lastMessageId: newestId,
          lastScannedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    console.log(`[Discord] Ingested ${humanMessages.length} new message(s) from #${ch.name ?? ch.id}`);
  }

  // 5. AI analysis pass ─────────────────────────────────────────────────────
  const digest: DiscordDigestItem[] = [];

  if (!payload.skipAnalysis && allNewMessages.length > 0) {
    // Group by (channelId, category) for batch analysis
    const byChannel = new Map<string, typeof allNewMessages>();
    for (const msg of allNewMessages) {
      const key = msg.channelId;
      if (!byChannel.has(key)) byChannel.set(key, []);
      byChannel.get(key)!.push(msg);
    }

    for (const [channelId, msgs] of byChannel) {
      const category = msgs[0].category;
      const channelName = msgs[0].channelName ?? channelId;

      // Skip channels with trivial content to save AI budget
      if (msgs.every((m) => m.content.length < 30)) continue;

      const prompt = buildScoringPrompt(
        category,
        channelName,
        msgs.map((m) => ({
          id: m.id,
          content: m.content,
          author: m.authorUsername ?? "unknown",
        }))
      );

      try {
        const aiRes = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [{ role: "user", content: prompt }],
        });

        const raw = (aiRes as any).response
          .replace(/^```(?:json)?\n?/i, "")
          .replace(/\n?```$/i, "")
          .trim();

        const parsed = JSON.parse(raw) as {
          results: Array<{ id: string; score: number; summary: string }>;
        };

        // Update scores in D1 and collect high-scorers
        for (const result of parsed.results) {
          const msg = msgs.find((m) => m.id === result.id);
          if (!msg) continue;

          await db
            .update(discordMessages)
            .set({
              aiScore: result.score,
              aiSummary: result.summary,
              analysed: true,
            })
            .where(eq(discordMessages.id, result.id));

          if (result.score >= 60) {
            digest.push({
              messageId: result.id,
              channelName,
              category,
              author: msg.authorUsername ?? "unknown",
              content: msg.content,
              aiScore: result.score,
              aiSummary: result.summary,
              discordTimestamp: msg.discordTimestamp,
            });
          }
        }
      } catch (err) {
        console.error(`[Discord] AI analysis failed for channel ${channelId}:`, err);
        // Mark as analysed anyway so we don't retry forever
        for (const msg of msgs) {
          await db
            .update(discordMessages)
            .set({ analysed: true })
            .where(eq(discordMessages.id, msg.id));
        }
      }
    }
  }

  // 6. Persist high-scorers as research candidates ───────────────────────────
  if (digest.length > 0) {
    // Ensure there is a brief to attach candidates to
    let briefId = payload.briefId;
    if (!briefId) {
      const [brief] = await db
        .insert(researchBriefs)
        .values({
          title: `Discord Scan — ${new Date().toISOString().split("T")[0]}`,
          rawBriefContent: JSON.stringify({
            source: "discord",
            description: "Automated daily Discord channel scan",
          }),
          status: "complete",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      briefId = brief.id;
    }

    const candidateRows = digest.map((item) => ({
      id: createId(),
      briefId: briefId!,
      sourceId: item.messageId,
      sourceUrl: `https://discord.com/channels/@me/${item.messageId}`,
      sourceType: "discord" as const,
      initialSummary: `[${item.category}] @${item.author}: ${item.aiSummary}`,
      judgeScore: item.aiScore,
      judgeReasoning: item.aiSummary,
      createdAt: new Date(),
    }));

    await db.insert(researchCandidates).values(candidateRows).onConflictDoNothing();
    console.log(`[Discord] Stored ${candidateRows.length} high-value message(s) as research candidates.`);
  }

  console.log(
    `[Discord] Scan complete — ingested: ${totalIngested}, highlighted: ${digest.length}`
  );
  return {
    status: "success",
    ingested: totalIngested,
    highlighted: digest.length,
    digest,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Workflow class
// ─────────────────────────────────────────────────────────────────────────────

export class DiscordResearchWorkflow extends WorkflowEntrypoint<any, DiscordResearchPayload> {
  async run(
    event: Readonly<WorkflowEvent<DiscordResearchPayload>>,
    step: WorkflowStep
  ) {
    const payload = event.payload ?? {};

    const result = await step.do("discord-scan", async () => {
      return runDiscordResearch(this.env, payload);
    });

    return result;
  }
}
