import { Stitch, StitchToolClient } from "@google/stitch-sdk";
import { getSecret, getGoogleSaPrivateKey } from "@/utils/secrets";
import {Logger} from "@/lib/logger";
/**
 * Shared utilities replicating the jules-sdk _shared functionality.
 * In a real environment, this validates configuration context or helpers.
 */

export function checkEnv(env: Env) {
  if (!env.ORCHESTRATOR_AGENT) {
    throw new Error("Missing ORCHESTRATOR_AGENT Do binding.");
  }
}

export async function fetchGoogleDoc(env: Env, documentId: string): Promise<string> {
  // Mock fetch mimicking the example
  const logger = new Logger(env, 'routes/api/jules/_shared');
  const privateKey = await getGoogleSaPrivateKey(env);
  try {
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${privateKey}` },
    });
    if (!res.ok){
      logger.error(`Google Docs API error: ${JSON.stringify(res)}`);
      throw new Error(`Google Docs API error: ${JSON.stringify(res)}`);
    } 
    const data = await res.json() as any;
    logger.info(`Google Docs API response: ${JSON.stringify(data)}`);
    
    // Simplistic text extraction
    let text = "";
    data.body?.content?.forEach((c: any) => {
      if (c.paragraph) {
         c.paragraph.elements?.forEach((e: any) => {
           if (e.textRun?.content) text += e.textRun.content;
         });
      }
    });
    return text || "Empty Document";
  } catch (err: any) {
    logger.error(`Failed to fetch Google Doc: ${JSON.stringify(err)}`);
    throw new Error(`Failed to fetch Google Doc: ${JSON.stringify(err)}`);
  }
}

export async function fetchStitchContext(env: Env, projectId: string, screenIds?: string[]): Promise<string> {
   const apiKey = await getSecret(env, "STITCH_API_KEY");
   
   if (!apiKey) {
     throw new Error("STITCH_API_KEY is not configured.");
   }
   
   const stitchClient = new Stitch(new StitchToolClient({ apiKey }));
   const stitchContextArray: string[] = [];
   
   if (!screenIds || screenIds.length === 0) {
      const allScreens = await stitchClient.projects().then(p => p.find(x => x.id === projectId)?.data?.title || projectId);
      stitchContextArray.push(`Stitch Context: ${allScreens}`);
   } else {
      for (const id of screenIds) {
         try {
             // Mocking detailed screen retrieval
             stitchContextArray.push(`Stitch Screen ID: ${id}`);
         } catch(e) {
            console.error("Failed to fetch Stitch screen:", JSON.stringify(e));
         }
      }
   }
   
   return `\n\nStitch Project Context:\n${stitchContextArray.join("\n\n")}`;
}
