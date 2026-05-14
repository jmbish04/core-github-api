import { SkillManager } from "./skills";
import { getDb } from "@/db";

/**
 * Local interface matching the SkillProvider contract used by Think internals.
 * @cloudflare/think does not export this type publicly, so we define it here.
 */
export interface SkillProvider {
  get(): Promise<string | null>;
  load(key: string): Promise<string | null>;
}
import { agentSkills } from "@/db/schemas/agents/skills";
import { Logger } from "@/lib/logger";

export class SkillManagerSkillProvider implements SkillProvider {
  private logger: Logger;
  
  constructor(private skillManager: SkillManager, private env: Env) {
    this.logger = new Logger(env as any, 'SkillManagerSkillProvider');
  }

  async get(): Promise<string | null> {
    const db = getDb(this.env.DB);
    const logPrefix = '[SkillManagerSkillProvider.get] ';

    try {
      this.logger.info(`${logPrefix}Fetching skills from database...`);
      const results = await db
        .select({ name: agentSkills.name, description: agentSkills.description })
        .from(agentSkills);
      
      if (results.length === 0) return "No skills available.";
      
      let md = "Available skills:\n";
      for (const row of results) {
        md += `- **${row.name}**: ${row.description}\n`;
      }
      this.logger.info(`${logPrefix}Skills fetched successfully: ${results.length}; ${md}`);
      return md;
    } catch (e: any) {
      this.logger.error(`${logPrefix}Failed to fetch skills: ${String(e)}`);
      return "Failed to fetch skills from database.";
    }
  }

  async load(key: string): Promise<string | null> {
    const logPrefix = '[SkillManagerSkillProvider.load]';
    this.logger.info(`${logPrefix}Loading skill: ${key}`);
    // getSkillInstructions handles cache fetching, DB fallback, and <skill_context> wrapping
    const content = await this.skillManager.getSkillInstructions([key]);
    if (!content || content.length === 0) {
      this.logger.warn(`${logPrefix}Skill not found: ${key}`);
      return null;
    }
    this.logger.info(`${logPrefix}Skill loaded successfully: ${key}; ${content}`);
    return content;
  }
}
