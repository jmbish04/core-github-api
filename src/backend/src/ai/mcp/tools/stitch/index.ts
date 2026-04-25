import { tool } from "ai";
import { z } from "zod";
import { StitchService } from "@/services/stitch/index";

// ──── ZOD SCHEMAS ──────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  title: z.string().describe("Optional. The title of the project.").optional(),
});

export const GetProjectSchema = z.object({
  name: z.string().describe("Required. Identifier. The resource name. Example: `projects/4044680601076201931`"),
});

export const ListProjectsSchema = z.object({
  filter: z.string().describe("Optional filter, e.g. `view=owned`").optional(),
});

export const ListScreensSchema = z.object({
  projectId: z.string().describe("Required. The project ID, e.g. '4044680601076201931'"),
});

export const GetScreenSchema = z.object({
  name: z.string().describe("Required. Identifier, e.g. `projects/4044680601076201931/screens/98b50`").optional(),
  projectId: z.string().describe("Required. The project ID"),
  screenId: z.string().describe("Required. The screen ID"),
});

export const GenerateScreenFromTextSchema = z.object({
  deviceType: z.enum(["MOBILE", "DESKTOP", "TABLET", "AGNOSTIC"]).describe("Device type").optional(),
  modelId: z.string().describe("Optional. Model to use.").optional(),
  projectId: z.string().describe("Required. The project ID"),
  prompt: z.string().describe("Required. Input text for generating the screen."),
});

export const EditScreensSchema = z.object({
  deviceType: z.enum(["MOBILE", "DESKTOP", "TABLET", "AGNOSTIC"]).describe("Device type").optional(),
  modelId: z.string().describe("Optional. Model to use.").optional(),
  projectId: z.string().describe("Required. The project ID"),
  prompt: z.string().describe("Required. Input text to edit the screen."),
  selectedScreenIds: z.array(z.string()).describe("Required. The screen IDs to edit."),
});


// ──── AI SDK TOOL BUILDERS ──────────────────────────────────────────────────

export const makeStitchTools = (env: Env) => ({
  create_project: tool({
    description: "Creates a new Stitch project.",
    parameters: CreateProjectSchema,
    execute: async (args: z.infer<typeof CreateProjectSchema>) => {
      const service = StitchService.getInstance(env);
      return service.createProject(args);
    }
  } as any),
  
  get_project: tool({
    description: "Retrieves details of a specific Stitch project.",
    parameters: GetProjectSchema,
    execute: async (args: z.infer<typeof GetProjectSchema>) => {
      const service = StitchService.getInstance(env);
      // In the schema, name is `projects/{id}`, we can parse it if needed
      const projectId = args.name.split("/").pop() || args.name;
      return service.getProject({ projectId });
    }
  } as any),
  
  list_projects: tool({
    description: "Lists all Stitch projects.",
    parameters: ListProjectsSchema,
    execute: async (args: z.infer<typeof ListProjectsSchema>) => {
      const service = StitchService.getInstance(env);
      return service.listProjects(args);
    }
  } as any),
  
  generate_screen_from_text: tool({
    description: "Generates a new UI screen inside a project from text.",
    parameters: GenerateScreenFromTextSchema,
    execute: async (args: z.infer<typeof GenerateScreenFromTextSchema>) => {
      const service = StitchService.getInstance(env);
      return service.generateScreenFromText(args);
    }
  } as any),
  
  edit_screens: tool({
    description: "Edits existing screens inside a project using a text prompt.",
    parameters: EditScreensSchema,
    execute: async (args: z.infer<typeof EditScreensSchema>) => {
      const service = StitchService.getInstance(env);
      return service.editScreens(args);
    }
  } as any),
  
  get_screen: tool({
    description: "Retrieves a specific screen's details.",
    parameters: GetScreenSchema,
    execute: async (args: z.infer<typeof GetScreenSchema>) => {
      const service = StitchService.getInstance(env);
      return service.getScreen(args);
    }
  } as any),
  
  list_screens: tool({
    description: "Lists all screens in a Stitch project.",
    parameters: ListScreensSchema,
    execute: async (args: z.infer<typeof ListScreensSchema>) => {
      const service = StitchService.getInstance(env);
      return service.listScreens(args);
    }
  } as any)
});

// Backward compatibility or direct access where needed
export { StitchService };
