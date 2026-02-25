// Imports lazy-loaded in sendEmail
export interface SendEmailParams {
  to: string;
  subject: string;
  contentHtml: string;
  plainTextFallback?: string;
}

/**
 * Wraps content in a Gmail-optimized, bulletproof HTML template.
 */
function buildOptimizedTemplate(subject: string, contentHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    /* Gmail-friendly resets */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f9fafb; }
  </style>
</head>
<body style="background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          
          <tr>
            <td align="center" style="background-color: #111827; padding: 30px 20px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Agentic Research Team</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px 30px; color: #374151; font-size: 16px; line-height: 1.6;">
              ${contentHtml}
            </td>
          </tr>

          <tr>
            <td align="center" style="background-color: #f3f4f6; padding: 20px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 13px;">
                Powered by Cloudflare Workers &bull; Automated Report
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Sends an email using Cloudflare's official Email Routing binding.
 */
export async function sendEmail(env: Env, params: SendEmailParams): Promise<void> {
  const { EmailMessage } = await import("cloudflare:email");
  const { createMimeMessage } = await import("mimetext");

  // MUST match the verified sender configured in your Cloudflare Email Routing dashboard
  const SENDER_EMAIL = "github-notifications@hacolby.app"; 
  const SENDER_NAME = "GitHub Notifications";

  const msg = createMimeMessage();
  msg.setSender({ name: SENDER_NAME, addr: SENDER_EMAIL });
  msg.setRecipient(params.to);
  msg.setSubject(params.subject);

  // Add plain text fallback if provided
  if (params.plainTextFallback) {
    msg.addMessage({
      contentType: "text/plain",
      data: params.plainTextFallback,
    });
  }

  // Add optimized HTML
  msg.addMessage({
    contentType: "text/html",
    data: buildOptimizedTemplate(params.subject, params.contentHtml),
  });

  const message = new EmailMessage(SENDER_EMAIL, params.to, msg.asRaw());

  try {
    // env.SEB is your Send Email Binding configured in wrangler.jsonc
    await env.SEB.send(message);
    console.log(`[Email] Successfully sent to ${params.to}`);
  } catch (error: any) {
    console.error(`[Email] Failed to send email to ${params.to}:`, error.message);
    throw error;
  }
}
