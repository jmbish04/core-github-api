import type { StitchService } from "../index";
import type { GetProjectParams } from "../types";

export async function getProject(service: StitchService, params: GetProjectParams) {
  service.logger.info(`Getting Stitch Project: ${params.projectId}`);
  return service.withClient(async (client, stitch) => {
    const result = await client.callTool<any>("get_project", {
      name: `projects/${params.projectId}`
    });
    return result;
  });
}
