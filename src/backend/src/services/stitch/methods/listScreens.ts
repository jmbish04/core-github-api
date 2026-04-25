import type { StitchService } from "../index";
import type { ListScreensParams } from "../types";

export async function listScreens(service: StitchService, params: ListScreensParams) {
  service.logger.info(`Listing screens in project: ${params.projectId}`);
  return service.withClient(async (client, stitch) => {
    const result = await client.callTool<any[]>("list_screens", {
      projectId: params.projectId
    });
    return result;
  });
}
