import { Stitch, StitchToolClient } from "@google/stitch-sdk";
import type { Env } from "../../../types";

/**
 * Shared utilities replicating the jules-sdk _shared functionality.
 * In a real environment, this validates configuration context or helpers.
 */

export function checkEnv(env: Env) {
  if (!env.JULES_OVERSEER) {
    throw new Error("Missing JULES_OVERSEER Do binding.");
  }
}

export async function fetchGoogleDoc(env: Env, documentId: string, accessToken: string): Promise<string> {
  // Mock fetch mimicking the example
  try {
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Google Docs API error: ${res.statusText}`);
    const data = await res.json() as any;
    
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
    throw new Error(`Failed to fetch Google Doc: ${err.message}`);
  }
}

export async function fetchStitchContext(env: Env, projectId: string, screenIds?: string[]): Promise<string> {
   let apiKey = '';
   const rawKey = env.STITCH_API_KEY;
   if (typeof rawKey === 'string') {
     apiKey = rawKey;
   } else if (rawKey && typeof (rawKey as any).get === 'function') {
     apiKey = await (rawKey as any).get();
   }
   
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
