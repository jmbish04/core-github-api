/**
 * @file backend/src/lib/email-reports.ts
 * @description Email report generation for research results
 */

import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { JudgeScore } from "@/schemas/research";

export interface ResearchReportData {
  sessionId: string;
  mode: string;
  query: string | null;
  scores: JudgeScore[];
  totalCandidates: number;
  completedAt: Date;
}

/**
 * Generate Markdown email report for research session
 */
export function generateResearchReport(data: ResearchReportData): string {
  const { sessionId, mode, query, scores, totalCandidates, completedAt } = data;

  const topRepos = scores
    .filter((s) => s.recommendation !== "not_relevant")
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 3);

  const markdown = `
# 🔬 Daily Research Report

**Session ID:** \`${sessionId}\`  
**Mode:** ${mode}  
**Query:** ${query || "Trending repositories"}  
**Completed:** ${completedAt.toISOString()}  
**Candidates Analyzed:** ${totalCandidates}

---

## 🏆 Top 3 Repositories

${topRepos
  .map(
    (score, idx) => `
### ${idx + 1}. ${score.repoId}

**Overall Score:** ${score.overallScore.toFixed(1)}/10  
**Recommendation:** ${score.recommendation.replace(/_/g, " ").toUpperCase()}

**Strengths:**
${score.strengths.map((s) => `- ✅ ${s}`).join("\n")}

**Weaknesses:**
${score.weaknesses.map((w) => `- ⚠️ ${w}`).join("\n")}

**Judge Reasoning:**
> ${score.reasoning}

---
`
  )
  .join("\n")}

## 📊 Summary Statistics

| Metric | Value |
|--------|-------|
| Total Candidates | ${totalCandidates} |
| Highly Relevant | ${scores.filter((s) => s.recommendation === "highly_relevant").length} |
| Relevant | ${scores.filter((s) => s.recommendation === "relevant").length} |
| Not Relevant | ${scores.filter((s) => s.recommendation === "not_relevant").length} |
| Average Score | ${(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length).toFixed(2)}/10 |

---

*This report was generated automatically by the Research Orchestrator workflow.*
`;

  return markdown.trim();
}

/**
 * Send email report via SendEmail binding
 * Uses destination_address binding, so recipient is pre-configured
 */
export async function sendResearchReport(
  env: Env,
  reportData: ResearchReportData
): Promise<void> {
  const markdown = generateResearchReport(reportData);

  // Check if EMAIL_SENDER binding exists
  if (!env.EMAIL_SENDER) {
    console.warn("[Email] EMAIL_SENDER binding not configured, skipping email");
    return;
  }

  try {
    // Import EmailMessage from cloudflare:email
    const { EmailMessage } = await import("cloudflare:email");
    
    // Extract domain from BASE_URL
    const domain = env.BASE_URL.replace("https://", "").replace("http://", "");
    
    // Create MIME message with proper headers
    // Note: recipient can be undefined when using destination_address binding
    const emailContent = [
      `From: Research Bot <research@${domain}>`,
      `Subject: Daily Research Report - ${new Date().toLocaleDateString()}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      markdown,
    ].join("\r\n");

    const message = new EmailMessage(
      `research@${domain}`,
      "", // Empty string when using destination_address binding
      emailContent
    );

    await env.EMAIL_SENDER.send(message);

    console.log("[Email] Research report sent successfully");
  } catch (error) {
    console.error("[Email] Failed to send report:", error);
    throw error;
  }
}

/**
 * Fetch research session data for email report
 */
export async function getResearchReportData(
  env: Env,
  sessionId: string
): Promise<ResearchReportData | null> {
  const db = getDb(env.DB_WEBHOOKS);

  const session = await db.query.researchSessions.findFirst({
    where: eq(schema.researchSessions.id, sessionId),
  });

  if (!session || session.status !== "completed") {
    return null;
  }

  const repoScores = await db.query.repoScores.findMany({
    where: eq(schema.repoScores.sessionId, sessionId),
  });

  const scores: JudgeScore[] = repoScores
    .filter((r) => r.finalScore !== null)
    .map((r) => ({
      repoId: r.repoId,
      overallScore: r.finalScore!,
      reasoning: r.judgeReasoning || "",
      strengths: JSON.parse(r.strengths || "[]"),
      weaknesses: JSON.parse(r.weaknesses || "[]"),
      recommendation: r.recommendation as any,
    }));

  return {
    sessionId: session.id,
    mode: session.mode,
    query: session.query,
    scores,
    totalCandidates: repoScores.length,
    completedAt: session.completedAt || new Date(),
  };
}
