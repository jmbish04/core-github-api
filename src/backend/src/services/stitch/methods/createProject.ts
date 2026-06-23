import type { StitchService } from "../index";
import type { CreateProjectParams } from "../types";

export async function createProject(service: StitchService, params: CreateProjectParams) {
  service.logger.info(`Creating Stitch Project: ${params.title || 'Untitled'}`);
  return service.withClient(async (client, stitch) => {
    // Relying on Stitch SDK mapping
    const result = await client.callTool<{ id: string, name: string }>("create_project", {
      title: params.title,
    });
    return result;
  });
}
