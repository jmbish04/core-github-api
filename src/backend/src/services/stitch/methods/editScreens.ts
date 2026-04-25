import type { StitchService } from "../index";
import type { EditScreensParams } from "../types";

export async function editScreens(service: StitchService, params: EditScreensParams) {
  const screens = params.selectedScreenIds ?? params.screenIds ?? [];
  const prompt = params.prompt ?? params.editPrompt ?? '';
  service.logger.info(`Editing ${screens.length} screens in project: ${params.projectId}`);
  return service.withClient(async (client, _stitch) => {
    const result = await client.callTool<any>("edit_screens", {
      projectId: params.projectId,
      prompt,
      selectedScreenIds: screens,
      deviceType: params.deviceType,
      modelId: params.modelId
    });
    return result;
  });
}
