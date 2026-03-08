export const GitHubConditionals = {
  /**
   * Checks if the user associated with a comment or event is a bot or an AI agent like Gemini/Google Code Assist.
   */
  isBotOrAgentUser(user?: { login?: string; type?: string }): boolean {
    if (!user) return false;
    const login = user.login?.toLowerCase() || '';
    return login.includes('gemini') || login === 'google-code-assist' || user.type === 'Bot';
  },

  /**
   * Checks if a specific slash command (like '/gemini review') is already present in a list of comments.
   */
  hasCommentCommand(comments: { body?: string | null; [key: string]: unknown }[], command: string = '/gemini review'): boolean {
    return comments.some(c => c.body?.includes(command));
  }
};
