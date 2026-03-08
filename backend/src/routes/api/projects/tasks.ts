import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { getDb } from '@db';
import { workshopProjectTasks } from '@db/schemas/workshop/project_tasks';
export const taskRouter = new OpenAPIHono<{ Bindings: Env }>();

// --- Zod Schemas ---
const StepSchema = z.object({
  number: z.number().openapi({ example: 1.1 }),
  title: z.string().openapi({ example: 'Create schema file' }),
  status: z.enum(['not_started', 'started', 'blocked', 'scaffold_complete', 'pending_success_criteria_signoff', 'complete']).default('not_started'),
  technical_requirements: z.array(z.string()),
  success_criteria: z.array(z.string()),
});

const TaskSchema = z.object({
  task_number: z.number().openapi({ example: 1 }),
  status: z.enum(['not_started', 'started', 'blocked', 'scaffold_complete', 'pending_success_criteria_signoff', 'complete']).default('not_started'),
  agent_assigned: z.string().optional(),
  task_title: z.string().openapi({ example: 'Create D1 user schema' }),
  task_description: z.string(),
  task_dependencies: z.array(z.string()),
  cloudflare_docs_queries: z.array(z.string()),
  steps: z.array(StepSchema),
  requirements: z.array(z.string()),
  success_criteria: z.array(z.string()),
});

const FileChangeSchema = z.object({
  action: z.enum(['NEW', 'MODIFY', 'DELETE']),
  file_path: z.string(),
  instructions: z.array(z.string()),
});

const ImplementationPlanSchema = z.object({
  title: z.string(),
  description: z.string(),
  architecture: z.object({
    explanation: z.string(),
    mermaid_diagram: z.string(),
  }),
  proposed_changes: z.array(z.object({
    category: z.string(),
    files: z.array(FileChangeSchema),
  })),
  verification_plan: z.object({
    automated_tests: z.array(z.object({
      command: z.string(),
      expected_outcome: z.string(),
    })),
    manual_verification: z.array(z.string()),
  }),
});

const PhaseSchema = z.object({
  phase_number: z.number(),
  phase_title: z.string(),
  description: z.string(),
  success_criteria: z.array(z.string()),
  implementation_plan: ImplementationPlanSchema,
  tasks: z.array(TaskSchema),
});

export const ProjectTasksSchema = z.object({
  id: z.string().openapi({ example: 'proj-123' }),
  project_name: z.string().openapi({ example: 'core-github-api' }),
  generated_date: z.string().openapi({ example: '2026-03-06T10:00:00Z' }),
  total_phases: z.number().openapi({ example: 8 }),
  phases: z.array(PhaseSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

// --- Routes ---
const getProjectTasksRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(ProjectTasksSchema) } },
      description: 'Retrieve all project plans for specialist workshop agents',
    },
  },
});

taskRouter.openapi(getProjectTasksRoute, async (c) => {
  const db = getDb(c.env.DB);
  const projects = await db.select().from(workshopProjectTasks);
  
  const formattedProjects = projects.map((p: any) => ({
    id: p.id,
    project_name: p.projectName,
    generated_date: p.generatedDate,
    total_phases: p.totalPhases,
    phases: p.phases,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }));
  
  return c.json(formattedProjects, 200);
});

// Standard System Endpoints
taskRouter.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
taskRouter.get('/context', (c) => c.json({ service: 'workshop-tasks-api', version: '1.0.0' }));
taskRouter.get('/docs', (c) => c.redirect('/swagger'));

// OpenAPI v3.1.0 Documentation
taskRouter.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: { version: '1.0.0', title: 'Specialist Workshop Tasks API' },
});
taskRouter.get('/swagger', swaggerUI({ url: '/openapi.json' }));
