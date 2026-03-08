import vibeRules from '../../../../.agent/rules/vibe-coding-orchestration.md';
import { JulesService } from './jules';

export async function dispatchToJules(env: Env, taskDescription: string) {
  const rules = `
--- STANDARDIZATION RULES ---
${vibeRules}
-----------------------------
`;

  const finalPrompt = `${rules}\n\nTask:\n${taskDescription}`;

  const julesService = JulesService.getInstance(env);

  // As per julesService implementation, startSession takes prompt and optional repo
  const session = await julesService.startSession({
    prompt: finalPrompt,
    autoPr: true
  });

  return session;
}
