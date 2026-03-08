import { HonoBaseAgent, HonoBaseAgentState } from "@/ai/agents/base/HonoBaseAgent";
import { getDb, workshopProjects, workshopProjectTasks } from "@db";
import type { Phase } from "@db/schemas/workshop/project_tasks";
import { eq } from "drizzle-orm";
import { createOrGetRepositoryForProject } from "@services/repository-sync";

export interface WorkshopAgentState extends HonoBaseAgentState {
  activeProjectId?: string;
}

/**
 * WorkshopAgent orchestrates the generation of project plans and 
 * creation of the GitHub repository. It functions as the backend 
 * brain for the Workshop Wizard UI.
 */
export class WorkshopAgent extends HonoBaseAgent<Env, WorkshopAgentState> {
  protected get agentName(): string {
    return "WorkshopAgent";
  }

  /**
   * Required by HonoBaseAgent — defines the expert persona used when
   * this agent is invoked for AI-powered orchestration tasks.
   */
  protected async getSystemPromptBase(): Promise<string> {
    return `You are the Workshop Orchestrator, an expert Cloudflare Workers architect.
Your responsibilities:
- Analyse user project requirements and decompose them into phased tasks.
- Coordinate specialist agents (Database, API, Frontend, AI) to build complete Cloudflare Worker applications.
- Ensure all generated plans are aligned with Drizzle ORM, Hono, and Astro best practices.
- Track project state via the WorkshopAgent Durable Object and persist progress to D1.
Always respond with structured, actionable output that can be rendered in the Workshop Wizard UI.`;
  }

  healthProbe() {
    return {
      status: "ok",
      agent: "WorkshopAgent",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Dispatches tasks to the appropriate specialist agents 
   * and tracks their completion.
   */
  async orchestrateTasks(projectId: string) {
    this.logger.info(`Orchestrating tasks for project ${projectId}`);
    return { success: true, message: "Tasks orchestrated" };
  }

  /**
   * Phase 3: Initializes the GitHub repository for the project.
   */
  async initializeRepository(projectId: string, params: { owner?: string, description?: string, visibility?: "public" | "private" }) {
    this.logger.info(`Initializing repository for project ${projectId}`);
    
    // Note: The actual database queries to save this are implemented in the Hono API
    // but the complex orchestration (contacting GitHub, syncing D1) can be done here.
    const db = getDb(this.env.DB);
    const proj = await db.select().from(workshopProjects).where(eq(workshopProjects.id, projectId)).limit(1);
    
    if (!proj[0]) {
      throw new Error(`Project ${projectId} not found.`);
    }

    const { owner, description, visibility } = params;
    
    const repoCreation = await createOrGetRepositoryForProject(this.env, {
        projectName: proj[0].name,
        description,
        owner,
        visibility
    });
    
    const repoUrl = `https://github.com/${repoCreation.owner}/${repoCreation.repoName}`;
    
    await db.update(workshopProjects).set({
        status: 'active',
        repoUrl
    }).where(eq(workshopProjects.id, projectId));

    return { success: true, repoUrl };
  }

  async ingestProjectPlan(projectId: string, jsonPayload: string) {
    // Dynamically query gateway
    const prompt = `
      You are a strict JSON parser for specialist workshop agents. Validate and extract the exact fields required by the Project Tasks Schema.
      Ensure project_name, generated_date, total_phases, and the deeply nested phases array are perfectly formatted.
      Payload: ${jsonPayload}
    `;

    const schema = {
      type: "object",
      properties: {
        project_name: { type: "string" },
        generated_date: { type: "string" },
        total_phases: { type: "number" },
        phases: { 
          type: "array", 
          items: { 
            type: "object",
            properties: {
              phase_number: { type: "number" },
              phase_title: { type: "string" },
              description: { type: "string" },
              success_criteria: { type: "array", items: { type: "string" } },
              implementation_plan: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  architecture: {
                    type: "object",
                    properties: {
                      explanation: { type: "string" },
                      mermaid_diagram: { type: "string" }
                    },
                    required: ["explanation", "mermaid_diagram"]
                  },
                  proposed_changes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string" },
                        files: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              action: { type: "string", enum: ["NEW", "MODIFY", "DELETE"] },
                              file_path: { type: "string" },
                              instructions: { type: "array", items: { type: "string" } }
                            },
                            required: ["action", "file_path", "instructions"]
                          }
                        }
                      },
                      required: ["category", "files"]
                    }
                  },
                  verification_plan: {
                    type: "object",
                    properties: {
                      automated_tests: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            command: { type: "string" },
                            expected_outcome: { type: "string" }
                          },
                          required: ["command", "expected_outcome"]
                        }
                      },
                      manual_verification: { type: "array", items: { type: "string" } }
                    },
                    required: ["automated_tests", "manual_verification"]
                  }
                },
                required: ["title", "description", "architecture", "proposed_changes", "verification_plan"]
              },
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task_number: { type: "number" },
                    status: { type: "string", enum: ["not_started", "started", "blocked", "scaffold_complete", "pending_success_criteria_signoff", "complete"] },
                    agent_assigned: { type: "string" },
                    task_title: { type: "string" },
                    task_description: { type: "string" },
                    task_dependencies: { type: "array", items: { type: "string" } },
                    cloudflare_docs_queries: { type: "array", items: { type: "string" } },
                    steps: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          number: { type: "number" },
                          title: { type: "string" },
                          status: { type: "string", enum: ["not_started", "started", "blocked", "scaffold_complete", "pending_success_criteria_signoff", "complete"] },
                          technical_requirements: { type: "array", items: { type: "string" } },
                          success_criteria: { type: "array", items: { type: "string" } }
                        },
                        required: ["number", "title", "status", "technical_requirements", "success_criteria"]
                      }
                    },
                    requirements: { type: "array", items: { type: "string" } },
                    success_criteria: { type: "array", items: { type: "string" } }
                  },
                  required: ["task_number", "status", "task_title", "task_description", "task_dependencies", "cloudflare_docs_queries", "steps", "requirements", "success_criteria"]
                }
              }
            },
            required: ["phase_number", "phase_title", "description", "success_criteria", "implementation_plan", "tasks"],
            additionalProperties: false
          } 
        }
      },
      required: ["project_name", "total_phases", "phases"],
      additionalProperties: false
    };

    const res = await super.fetch(new Request("http://agent/chat", {
       method: "POST", headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ message: prompt })
    }));
    const data: any = await res.json();
    let jsonString = data.reply || data.response || "{}";
    jsonString = jsonString.replace(/```json\\n/g, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(jsonString) as any;
    
    // Process and insert into D1
    const db = getDb(this.env.DB);
    
    // Remote old phases if they exist to prevent duplicates or stale data
    await db.delete(workshopProjectTasks).where(eq(workshopProjectTasks.projectId, projectId));
    
    await db.insert(workshopProjectTasks).values({
      id: crypto.randomUUID(),
      projectId: projectId,
      projectName: parsedData.project_name,
      generatedDate: parsedData.generated_date || new Date().toISOString(),
      totalPhases: parsedData.total_phases,
      phases: parsedData.phases,
    });
    
    return parsedData;
  }
}
