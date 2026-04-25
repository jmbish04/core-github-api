import { SkillManager } from "./skills";
import type { SkillProvider } from "@cloudflare/think";
import { getDb } from "@/db";
import { agentSkills } from "@/db/schemas/agents/skills";

export class SkillManagerSkillProvider implements SkillProvider {
  constructor(private skillManager: SkillManager, private env: Env) {}

  async get(): Promise<string | null> {
    const db = getDb(this.env.DB);
    try {
      const results = await db
        .select({ name: agentSkills.name, description: agentSkills.description })
        .from(agentSkills);
      
      if (results.length === 0) return "No skills available.";
      
      let md = "Available skills:\n";
      for (const row of results) {
        md += `- **${row.name}**: ${row.description}\n`;
      }
      return md;
    } catch (e) {
      return "Failed to fetch skills from database.";
    }
  }

  async load(key: string): Promise<string | null> {
    // getSkillInstructions handles cache fetching, DB fallback, and <skill_context> wrapping
    const content = await this.skillManager.getSkillInstructions([key]);
    if (!content || content.length === 0) return null;
    return content;
  }
}
