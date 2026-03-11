import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { OpenAI } from "openai";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { podcasts } from "@/db/schemas/app/podcasts";
import { z } from "zod";

export interface Env {
  DB: D1Database;
  PODCAST_BUCKET: R2Bucket;
  AI: any;
  CF_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
  OPENAI_API_KEY: string;
}

const DialogueSchema = z.object({
  dialogue: z.array(
    z.object({
      speaker: z.enum(["host1", "host2"]),
      text: z.string(),
    })
  ),
});

export class PodcastAgent extends DurableObject<Env> {
  private app: Hono<{ Bindings: Env }>;
  private db: ReturnType<typeof drizzle>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.app = new Hono<{ Bindings: Env }>();
    this.db = drizzle(env.DB);
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.post("/generate", async (c) => {
      const { topic, urls, githubRepos, discordThreads } = await c.req.json();

      // Initialize Podcast Record
      const id = crypto.randomUUID();
      await this.db.insert(podcasts).values({
        id,
        title: `Podcast: ${topic}`,
        topic,
        status: "processing",
        created_at: new Date(),
      });

      // Fire and forget the heavy lifting
      this.ctx.waitUntil(this.processPodcast(id, topic, { urls, githubRepos, discordThreads }));

      return c.json({ id, status: "processing" });
    });
  }

  private async processPodcast(id: string, topic: string, context: any) {
    try {
      const openai = new OpenAI({
        baseURL: `https://gateway.ai.cloudflare.com/v1/${this.env.CF_ACCOUNT_ID}/${this.env.AI_GATEWAY_NAME}/openai`,
        apiKey: this.env.OPENAI_API_KEY,
      });

      const contextData = await this.fetchContextData(context);

      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: "You are two podcast hosts (host1: male, host2: female). Create an educational, conversational script discussing the provided context. Output ONLY valid JSON matching the schema: { dialogue: [{ speaker: 'host1'|'host2', text: '...' }] }."
          },
          { role: "user", content: `Topic: ${topic}\nContext: ${JSON.stringify(contextData)}` }
        ],
        response_format: { type: "json_object" }
      });

      const rawContent = completion.choices[0].message.content || '{"dialogue": []}';
      const parsed = DialogueSchema.parse(JSON.parse(rawContent));
      const transcript = parsed.dialogue;

      const audioBuffers: ArrayBuffer[] = [];

      for (const segment of transcript) {
        const audioResponse = await this.env.AI.run("@cf/suno/bark", {
          prompt: segment.text,
        });
        audioBuffers.push(audioResponse);
      }

      // Concatenate ArrayBuffers (simplified for WAV/PCM, depends on output format)
      const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.byteLength, 0);
      const finalAudioBuffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of audioBuffers) {
        finalAudioBuffer.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }

      const r2Key = `podcasts/${id}.wav`;
      await this.env.PODCAST_BUCKET.put(r2Key, finalAudioBuffer, {
        httpMetadata: { contentType: "audio/wav" },
      });

      await this.db.update(podcasts).set({
        transcript: JSON.stringify(transcript),
        r2_audio_key: r2Key,
        audio_url: `/api/podcasts/${id}/audio`,
        status: "completed",
      }).where(eq(podcasts.id, id));

    } catch (error) {
      console.error(`Podcast Generation Failed for ${id}:`, error);
      await this.db.update(podcasts).set({ status: "failed" }).where(eq(podcasts.id, id));
    }
  }

  private async fetchContextData(context: any) {
    return { summary: "Extracted context from GitHub, Discord, and Web." };
  }

  fetch(req: Request) {
    return this.app.fetch(req, this.env, this.ctx as any);
  }
}
