import { EmailTemplaterService } from "@/services/email/Templater";
import type { LearningAgent } from "@/ai/agents/backend/LearningAgent";

export async function sendDebrief(
  agent: LearningAgent,
  approvalId: string,
  repoFullName: string,
  julesSessionId?: string,
  outcome: "approved" | "rejected" = "approved"
): Promise<void> {
  const emailService = new EmailTemplaterService((agent as any).env);

  const subject =
    outcome === "approved"
      ? `✅ CI Healer: Fix Dispatched to Jules (${repoFullName})`
      : `❌ CI Healer: Fix Rejected (Approval ${approvalId})`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #0f0f12; color: #e4e4e7; padding: 32px;">
  <h1 style="color: ${outcome === "approved" ? "#34d399" : "#f87171"}; font-size: 22px; margin-bottom: 8px;">
    ${outcome === "approved" ? "✅ CI Healer Fix Dispatched" : "❌ CI Healer Fix Rejected"}
  </h1>
  <p style="color: #a1a1aa; margin: 0 0 16px;">
    Approval ID: <code style="color: #e4e4e7;">${approvalId}</code>
  </p>
  <table style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 8px 0; color: #71717a; width: 150px;">Repository</td>
      <td style="padding: 8px 0; color: #e4e4e7;">${repoFullName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #71717a;">Outcome</td>
      <td style="padding: 8px 0; color: ${outcome === "approved" ? "#34d399" : "#f87171"};">${outcome.toUpperCase()}</td>
    </tr>
    ${julesSessionId ? `<tr>
      <td style="padding: 8px 0; color: #71717a;">Jules Session</td>
      <td style="padding: 8px 0; color: #e4e4e7;"><code>${julesSessionId}</code></td>
    </tr>` : ""}
  </table>
  <p style="margin-top: 24px; color: #52525b; font-size: 12px;">
    Sent by the Colony CI Healer · github-notifications@hacolby.app
  </p>
</body>
</html>`;

  await emailService.sendDebrief(subject, htmlContent);
}
