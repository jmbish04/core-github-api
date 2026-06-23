import type { StitchService } from "../index";
import type { GetScreenParams } from "../types";

export async function getScreen(service: StitchService, params: GetScreenParams) {
  service.logger.info(`Getting screen ${params.screenId} in project ${params.projectId}`);
  return service.withClient(async (client, stitch) => {
    const result = await client.callTool<any>("get_screen", {
      projectId: params.projectId,
      screenId: params.screenId,
      name: `projects/${params.projectId}/screens/${params.screenId}`
    });
    return result;
  });
}
