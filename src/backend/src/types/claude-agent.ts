export interface IClaudeAgentRPC {
  getAgentStatus(userId: string): Promise<{ userId: string; running: boolean }>;
  startAgent(userId: string): Promise<{ userId: string; started: boolean }>;
  stopAgent(userId: string): Promise<{ userId: string; stopped: boolean }>;
  executeCommand(userId: string, cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}
