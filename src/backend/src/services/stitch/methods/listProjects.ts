import type { StitchService } from "../index";
import type { ListProjectsParams } from "../types";

export async function listProjects(service: StitchService, params: ListProjectsParams) {
  service.logger.info(`Listing Stitch Projects (Filter: ${params.filter})`);
  return service.withClient(async (client, stitch) => {
    const result = await client.callTool<any[]>("list_projects", {
      filter: params.filter
    });
    return result;
  });
}
