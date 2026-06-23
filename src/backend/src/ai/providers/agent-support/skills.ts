/**
 * @file src/ai/providers/agent-support/skills.ts
 * @description SkillManager for dynamic and static skill injection
 */
import { getDb } from "@/db";
import { agentSkills } from "@/db/schemas/agents/skills";
import { inArray } from "drizzle-orm";
import { Logger } from "@/lib/logger";



interface CachedSkill {
  content: string;
  expiresAt: number;
}

export class SkillManager {
  private cache: Map<string, CachedSkill>;
  private ttlMs: number;
  private env: Env;
  private logger: Logger;
  private logPrefix: string;

  constructor(env: Env, ttlMinutes = 5) {
    this.env = env;
    this.cache = new Map();
    this.ttlMs = ttlMinutes * 60 * 1000;
    this.logger = new Logger(env, "SkillManager");
    this.logPrefix = "SkillManager";
  }

  /**
   * Extracts the X-Agent-Skills header content for dynamic injection
   */
  public extractHeaders(request?: Request): string[] {
    if (!request){
      this.logger.warn(`[${this.logPrefix} extractHeaders]: No request provided`);
      return [];
    }
    const headerStr = request.headers.get("X-Agent-Skills");
    if (!headerStr) {
      this.logger.warn(`[${this.logPrefix} extractHeaders]: No X-Agent-Skills header provided`);
      return [];
    }

    const results = headerStr.split(",").map(s => s.trim()).filter(s => s.length > 0);
    this.logger.info(`[${this.logPrefix} extractHeaders]: Extracted ${results.length} skills; ${JSON.stringify(results)}`);
    return results;
  }

  /**
   * Pre-fetches skills from D1 if they are not in the cache or are expired.
   */
  public async prefetch(skills: string[]): Promise<void> {
    if (!skills || skills.length === 0) {
      this.logger.warn(`[${this.logPrefix} prefetch]: No skills provided`);
      return;
    }
    
    // Find missing skills
    const missing = skills.filter(s => !this.isCached(s));
    if (missing.length === 0){
      this.logger.info(`[${this.logPrefix} prefetch]: All skills are cached`);
      return;
    }
    this.logger.info(`[${this.logPrefix} prefetch]: Fetching ${missing.length} skills`);
    await this.fetchFromDb(missing);  
    
  }

  /**
   * Checks for valid vs missing skills.
   * Returns sets for agentInit() startup check. Warns on unknown.
   */
  public async validate(skills: string[]): Promise<{ valid: string[], missing: string[] }> {
    if (!skills || skills.length === 0){
      this.logger.warn(`[${this.logPrefix} validate]: No skills provided`);
      return { valid: [], missing: [] };
    }
    const unique = [...new Set(skills.map(s => s.trim()).filter(s => s.length > 0))];
    this.logger.info(`[${this.logPrefix} validate]: Validating ${unique.length} skills; ${JSON.stringify(unique)}`);

    await this.prefetch(unique);
    
    const valid: string[] = [];
    const missing: string[] = [];
    
    for (const skill of unique) {
      if (this.isCached(skill)) {
        valid.push(skill);
      } else {
        missing.push(skill);
      }
    }
    
    if (missing.length > 0) {
      this.logger.warn(`[${this.logPrefix} validate]: Unknown skill names: ${missing.join(", ")}`);
    }
    
    this.logger.info( `[${this.logPrefix} validate]: Valid skills: ${valid.length}; ${JSON.stringify(valid)}`);
    this.logger.info( `[${this.logPrefix} validate]: Missing skills: ${missing.length}; ${JSON.stringify(missing)}`);
    return { valid, missing };
  }
  
  /**
   * Union and deduplication of static + request-time skills
   */
  public resolveEffective(staticSkills: string[], dynamicSkills: string[]): string[] {
      const all = [...(staticSkills || []), ...(dynamicSkills || [])];
      const unique = [...new Set(all.map(s => s.trim()).filter(s => s.length > 0))];
      this.logger.info(`[${this.logPrefix} resolveEffective]: Resolved ${unique.length} effective skills; ${JSON.stringify(unique)}`);
      return unique;
  }

  /**
   * Resolves the markdown context block for the provided skills.
   * If a skill isn't cached, it prefetches it.
   */
  public async getSkillInstructions(skills: string[]): Promise<string> {
    const { valid } = await this.validate(skills);
    this.logger.info(`[${this.logPrefix} getSkillInstructions]: Resolving ${valid.length} valid skills`);
    if (valid.length === 0) {
      this.logger.warn(`[${this.logPrefix} getSkillInstructions]: No valid skills found`);
      return "";
    }

    let context = "";
    for (const skill of valid) {
        context += this.wrap(this.cache.get(skill)!.content);
    }
    this.logger.info(`[${this.logPrefix} getSkillInstructions]: Resolved ${valid.length} valid skills`);
    return context;
  }
  
  private wrap(content: string): string {
      return `\n\n<skill_context>\n${content}\n</skill_context>`;
  }

  private isCached(skill: string): boolean {
    const cached = this.cache.get(skill);
    if (!cached) return false;
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(skill);
      return false;
    }
    return true;
  }

  private async fetchFromDb(skills: string[]): Promise<void> {
    if (!this.env.DB){
      this.logger.error(`[${this.logPrefix} fetchFromDb]: No DB provided`);
      return;
    }
    
    try {
      const db = getDb(this.env.DB);
      const results = await db
        .select({ name: agentSkills.name, content: agentSkills.markdownContent })
        .from(agentSkills)
        .where(inArray(agentSkills.name, skills));

      const now = Date.now();
      for (const row of results) {
        this.cache.set(row.name, {
          content: row.content,
          expiresAt: now + this.ttlMs
        });
      }
    } catch (error) {
      this.logger.error(`[${this.logPrefix} fetchFromDb]: Failed to fetch skills: ${error}`);
      throw error;
    }
  }
}
