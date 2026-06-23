import type { StitchService } from "../index";
import type { GenerateScreenFromTextParams } from "../types";

export async function generateScreenFromText(service: StitchService, params: GenerateScreenFromTextParams) {
  service.logger.info(`Generating screen for project: ${params.projectId}`);
  return service.withClient(async (client, stitch) => {
    const result = await client.callTool<any>("generate_screen_from_text", {
      projectId: params.projectId,
      prompt: params.prompt,
      deviceType: params.deviceType || "DESKTOP",
      modelId: params.modelId
    });
    return result;
  });
}
