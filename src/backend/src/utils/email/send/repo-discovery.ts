// src/utils/email/send/repo-discovery.ts
import Handlebars from "handlebars";
import { getDb, schema } from "@db";
import { eq } from "drizzle-orm";

// Assuming esbuild / wrangler is configured to import .hbs as raw text
import emailHeadRaw from "@/utils/email/templates/base/email-head.hbs";
import ampEmailRaw from "@/utils/email/templates/repo-discovery/email-template.hbs";
import fallbackEmailRaw from "@/utils/email/templates/base/email-fallback.hbs";

// ── Type Definitions ──────────────────────────────────────────────────────────

export interface RepoResearchData {
  owner: string;
  repo: string;
  description: string;
  aiSummary: string;
  personalReasoning: string;
  tags: string[];
  imageUrl?: string;
  workerChatUrl?: string;
}

export interface DailyTrendsData {
  date: string;
  trend_summary: string;
  top_picks: Array<{
    name: string;
    url: string;
    category: string;
    why_its_interesting: string;
    innovation_score: number;
  }>;
}

/** Shape passed to the Handlebars template for each CF changelog entry. */
export interface CloudflareChangelogItem {
  id: string;
  title: string;
  link: string;
  aiSummary: string | null;
  pubDate: string;
}

export interface SendEmailParams {
  to?: string;
  subject: string;
  title: string;
  contentHtml?: string;
  ampData?: RepoResearchData;
  dailyTrendsData?: DailyTrendsData;
  /**
   * When provided, these entries are injected into the Handlebars context under
   * `cloudflareUpdates` and the corresponding rows are marked `emailed = true`
   * after a successful send.
   *
   * If this field is omitted the function automatically fetches all unemailed
   * rows from the `cloudflare_changelog` D1 table (requires `env`).
   */
  cloudflareUpdates?: CloudflareChangelogItem[];
  plainTextFallback?: string;
}

// Register the partial so {{> head }} works inside the AMP template
Handlebars.registerPartial("head", emailHeadRaw);

// ── Main Send Function ────────────────────────────────────────────────────────

export async function sendRepoDiscoveryEmail(env: Env, params: SendEmailParams): Promise<void> {
  const { EmailMessage } = await import("cloudflare:email");
  const { createMimeMessage } = await import("mimetext");

  const SENDER_EMAIL = "github-notifications@hacolby.app";
  const SENDER_NAME = "Agentic Research Team";
  const RECIPIENT = params.to || "subscriber@hacolby.app";

  // ── Resolve Cloudflare Changelog entries ──────────────────────────────────
  // Pull from D1 if the caller did not explicitly provide items.
  let cfUpdates: CloudflareChangelogItem[] = params.cloudflareUpdates ?? [];
  let cfUpdateIds: string[] = [];

  if (!params.cloudflareUpdates) {
    try {
      const db = getDb(env.DB);
      const rows = await db
        .select({
          id: schema.cloudflareChangelog.id,
          title: schema.cloudflareChangelog.title,
          link: schema.cloudflareChangelog.link,
          aiSummary: schema.cloudflareChangelog.aiSummary,
          pubDate: schema.cloudflareChangelog.pubDate,
        })
        .from(schema.cloudflareChangelog)
        .where(eq(schema.cloudflareChangelog.emailed, false));

      cfUpdates = rows.map((r) => ({
        id: r.id,
        title: r.title,
        link: r.link,
        aiSummary: r.aiSummary ?? null,
        pubDate: r.pubDate,
      }));
      cfUpdateIds = rows.map((r) => r.id);
    } catch (err: any) {
      // Non-fatal: email still sends without the CF section
      console.warn("[Email] Failed to query cloudflare_changelog:", err.message);
    }
  }

  // ── Build MIME message ────────────────────────────────────────────────────
  const msg = createMimeMessage();
  msg.setSender({ name: SENDER_NAME, addr: SENDER_EMAIL });
  msg.setRecipient(RECIPIENT);
  msg.setSubject(params.subject);

  if (params.plainTextFallback) {
    msg.addMessage({
      contentType: "text/plain",
      data: params.plainTextFallback,
    });
  }

  // Compile the fallback template and pass all context in a single pass.
  const fallbackTemplate = Handlebars.compile(fallbackEmailRaw);
  const templateContext: Record<string, unknown> = {
    subject: params.subject,
    title: params.title,
    contentHtml: params.contentHtml || "",
    cloudflareUpdates: cfUpdates.length > 0 ? cfUpdates : undefined,
  };
  if (params.dailyTrendsData) {
    templateContext.summary = params.dailyTrendsData.trend_summary;
    templateContext.repos = params.dailyTrendsData.top_picks;
  }
  msg.addMessage({
    contentType: "text/html",
    data: fallbackTemplate(templateContext),
  });

  // If AMP data is provided, compile and append the interactive layer
  if (params.ampData) {
    const ampTemplate = Handlebars.compile(ampEmailRaw);
    const ampContext = {
      title: params.title,
      workerChatUrl: params.ampData.workerChatUrl || `${(env as any).BASE_URL || ""}/public/amp-chat`,
      ...params.ampData,
    };
    msg.addMessage({
      contentType: "text/x-amp-html",
      data: ampTemplate(ampContext),
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const message = new EmailMessage(SENDER_EMAIL, RECIPIENT, msg.asRaw());

  try {
    await env.SEND_EMAIL_NEWSLETTER.send(message);
    console.log(`[Email] Successfully sent to ${RECIPIENT}`);
  } catch (error: any) {
    console.error(`[Email] Failed to send email to ${RECIPIENT}:`, error.message);
    throw error;
  }

  // ── Mark CF changelog entries as emailed (only on confirmed send) ──────────
  if (cfUpdateIds.length > 0) {
    try {
      const db = getDb(env.DB);
      // Drizzle SQLite doesn't have inArray for update in a single query;
      // iterate to stay compatible without raw SQL.
      for (const id of cfUpdateIds) {
        await db
          .update(schema.cloudflareChangelog)
          .set({ emailed: true })
          .where(eq(schema.cloudflareChangelog.id, id));
      }
      console.log(`[Email] Marked ${cfUpdateIds.length} CF changelog entries as emailed.`);
    } catch (err: any) {
      // Log but do not rethrow — email was already sent successfully.
      console.error("[Email] Failed to mark CF changelog entries as emailed:", err.message);
    }
  }
}