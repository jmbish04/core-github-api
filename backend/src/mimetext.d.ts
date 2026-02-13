declare module 'mimetext' {
  export interface MimeMessage {
    setSender(sender: { name: string; addr: string }): void;
    setRecipient(recipient: string): void;
    setSubject(subject: string): void;
    addMessage(message: { contentType: string; data: string }): void;
    asRaw(): string;
  }
  export function createMimeMessage(): MimeMessage;
}
