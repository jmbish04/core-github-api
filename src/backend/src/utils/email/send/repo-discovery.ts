// src/utils/email.ts
import Handlebars from "handlebars";

// Assuming esbuild / wrangler is configured to import .hbs as raw text
import emailHeadRaw from "@/utils/email/templates/base/email-head.hbs";
import ampEmailRaw from "@/utils/email/templates/repo-discovery/email-template.hbs";
import fallbackEmailRaw from "@/utils/email/templates/base/email-fallback.hbs";

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

export interface SendEmailParams {
  to?: string;
  subject: string;
  title: string;             
  contentHtml?: string;       
  ampData?: RepoResearchData; 
  dailyTrendsData?: DailyTrendsData;
  plainTextFallback?: string;
}

// Register the partial so {{> head }} works inside the AMP template
Handlebars.registerPartial("head", emailHeadRaw);

export async function sendRepoDiscoveryEmail(env: Env, params: SendEmailParams): Promise<void> {
  const { EmailMessage } = await import("cloudflare:email");
  const { createMimeMessage } = await import("mimetext");

  const SENDER_EMAIL = "github-notifications@hacolby.app"; 
  const SENDER_NAME = "Agentic Research Team";
  // If destination address is configured on the binding, this is purely for the envelope/MIME
  const RECIPIENT = params.to || "subscriber@hacolby.app";

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

  // Compile the fallback template once and pass all data in a single pass.
  // When dailyTrendsData is provided, the template renders the structured
  // {{#each repos}} digest. contentHtml (if set) is rendered via {{{contentHtml}}}.
  const fallbackTemplate = Handlebars.compile(fallbackEmailRaw);
  const templateContext: Record<string, unknown> = {
    subject: params.subject,
    title: params.title,
    contentHtml: params.contentHtml || "",
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
    
    // Merge the title parameter into the data payload for the head partial
    const templateContext = {
      title: params.title,
      workerChatUrl: params.ampData.workerChatUrl || `${(env as any).BASE_URL || ""}/public/amp-chat`,
      ...params.ampData
    };

    msg.addMessage({
      contentType: "text/x-amp-html",
      data: ampTemplate(templateContext),
    });
  }

  const message = new EmailMessage(SENDER_EMAIL, RECIPIENT, msg.asRaw());

  try {
    await env.SEND_EMAIL_NEWSLETTER.send(message);
    console.log(`[Email] Successfully sent to ${RECIPIENT} (or Binding Target)`);
  } catch (error: any) {
    console.error(`[Email] Failed to send email to ${RECIPIENT}:`, error.message);
    throw error;
  }
}