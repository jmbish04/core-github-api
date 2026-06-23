import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";


export class EmailTemplaterService {
  constructor(private readonly env: Env) {}

  /**
   * Constructs and sends an HTML debrief email via Cloudflare Email Routing bindings.
   * Leverages `mimetext` to construct multipart messages.
   * 
   * @param subject The email subject line.
   * @param htmlContent The fully rendered HTML content.
   * @param textFallback Plain text fallback for non-HTML clients.
   */
  async sendDebrief(subject: string, htmlContent: string, textFallback?: string): Promise<void> {
    try {
      const msg = createMimeMessage();

      // Ensure sender/recipient match the active Email Routing constraints.
      msg.setSender({ name: "CI Healer (Colony AI)", addr: "github-notifications@hacolby.app" });
      msg.setRecipient("justin@126colby.com");
      msg.setSubject(subject);

      // Add HTML configuration
      msg.addMessage({
        contentType: "text/html",
        data: htmlContent
      });

      if (textFallback) {
         msg.addMessage({
           contentType: "text/plain",
           data: textFallback
         });
      }

      const emailMessage = new EmailMessage(
        "github-notifications@hacolby.app",
        "justin@126colby.com",
        msg.asRaw()
      );

      // Invoke the email binding
      await this.env.SEND_EMAIL.send(emailMessage);

    } catch (e: any) {
      console.error(`Failed to dispatch Email Debrief: ${e.message}`, e);
    }
  }
}
