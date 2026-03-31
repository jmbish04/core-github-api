import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { createDiscordApiClient } from '@/services/discord/client';

export type Bindings = Env;

// ============================================================================
// ZOD SCHEMAS
// ============================================================================
const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  bot: z.boolean().optional(),
}).openapi('DiscordUser');

const MessageSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  content: z.string(),
  timestamp: z.string(),
  author: UserSchema.optional(),
}).openapi('DiscordMessage');

const ChannelSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  type: z.number(),
  guild_id: z.string().optional(),
  parent_id: z.string().nullable().optional(),
}).openapi('DiscordChannel');

const GuildSchema = z.object({
  id: z.string(),
  name: z.string(),
}).openapi('DiscordGuild');

const ErrorSchema = z.object({
  error: z.string(),
  details: z.any().optional(),
}).openapi('ErrorResponse');

const ConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  guildId: z.string(),
  channels: z.array(z.string()).nullable(),
  prompt: z.string().nullable(),
  cronSchedule: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
}).openapi('DiscordResearchConfig');

const CreateConfigSchema = z.object({
  name: z.string(),
  guildId: z.string(),
  channels: z.array(z.string()).optional(),
  prompt: z.string().optional(),
  cronSchedule: z.string().optional(),
  isActive: z.boolean().optional().default(true),
}).openapi('CreateDiscordResearchConfig');

const UpdateConfigSchema = CreateConfigSchema.partial().openapi('UpdateDiscordResearchConfig');

// ============================================================================
// APPLICATION SETUP
// ============================================================================
const app = new OpenAPIHono<{ Bindings: Bindings }>();

// ============================================================================
// DISCORD ENDPOINTS
// ============================================================================

// 0. List of Guilds the bot is in
app.openapi(createRoute({
    operationId: 'getGuilds',
  method: 'get',
  path: '/guilds',
  responses: {
    200: { description: 'List of accessible guilds', content: { 'application/json': { schema: z.array(GuildSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const discord = await createDiscordApiClient(c.env);
    const guilds = await discord.getGuilds();
    return c.json(guilds, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch guilds', details: err.message }, 500);
  }
});

// 0.1 List of Channels for a specific guild
app.openapi(createRoute({
    operationId: 'getGuildsGuildIdChannels',
  method: 'get',
  path: '/guilds/{guildId}/channels',
  request: { params: z.object({ guildId: z.string() }) },
  responses: {
    200: { description: 'List of channels in a specific guild', content: { 'application/json': { schema: z.array(ChannelSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const { guildId } = c.req.valid('param');
    const discord = await createDiscordApiClient(c.env);
    const channels = await discord.getGuildChannels(guildId);
    const textChannels = channels.filter(ch => ch.type === 0);
    return c.json(textChannels, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch guild channels', details: err.message }, 500);
  }
});

// 0.2 Discord Research Configs CRUD
import { getDb } from '@/db';
import { discordResearchConfigs } from '@/db/schemas/github/research';
import { eq } from 'drizzle-orm';

app.openapi(createRoute({
    operationId: 'getConfigs',
  method: 'get',
  path: '/configs',
  responses: {
    200: { description: 'List of all Discord research configurations', content: { 'application/json': { schema: z.array(ConfigSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const db = getDb(c.env.DB);
    const configs = await db.select().from(discordResearchConfigs);
    return c.json(configs as any, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch discord research configs', details: err.message }, 500);
  }
});

app.openapi(createRoute({
    operationId: 'postConfigs',
  method: 'post',
  path: '/configs',
  request: { body: { content: { 'application/json': { schema: CreateConfigSchema } } } },
  responses: {
    201: { description: 'Created config', content: { 'application/json': { schema: ConfigSchema } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const body = c.req.valid('json');
    const db = getDb(c.env.DB);
    const [config] = await db.insert(discordResearchConfigs).values(body).returning();
    return c.json(config as any, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create discord research config', details: err.message }, 500);
  }
});

app.openapi(createRoute({
    operationId: 'putConfigsId',
  method: 'put',
  path: '/configs/{id}',
  request: { 
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: UpdateConfigSchema } } } 
  },
  responses: {
    200: { description: 'Updated config', content: { 'application/json': { schema: ConfigSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorSchema } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const db = getDb(c.env.DB);
    const [config] = await db.update(discordResearchConfigs)
      .set({ ...body, updatedAt: new Date() } as any)
      .where(eq(discordResearchConfigs.id, id))
      .returning();
      
    if (!config) return c.json({ error: 'Config not found' }, 404);
    return c.json(config as any, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to update discord research config', details: err.message }, 500);
  }
});

app.openapi(createRoute({
    operationId: 'deleteConfigsId',
  method: 'delete',
  path: '/configs/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Deleted config', content: { 'application/json': { schema: z.object({ success: z.boolean() }) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const { id } = c.req.valid('param');
    const db = getDb(c.env.DB);
    await db.delete(discordResearchConfigs).where(eq(discordResearchConfigs.id, id));
    return c.json({ success: true }, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to delete discord research config', details: err.message }, 500);
  }
});

// ============================================================================
// DISCORD ROUTES
// ============================================================================

// 1. List of Discord channels the registered user (bot) is following/accessing
app.openapi(createRoute({
    operationId: 'getChannels',
  method: 'get',
  path: '/channels',
  responses: {
    200: { description: 'List of channels across all accessible guilds', content: { 'application/json': { schema: z.array(ChannelSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const discord = await createDiscordApiClient(c.env);
    const guilds = await discord.getGuilds();
    
    let allChannels: z.infer<typeof ChannelSchema>[] = [];
    for (const guild of guilds) {
      const channels = await discord.getGuildChannels(guild.id);
      allChannels = allChannels.concat(channels);
    }
    // Only return text channels
    const textChannels = allChannels.filter(ch => ch.type === 0);
    return c.json(textChannels, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch channels', details: err.message }, 500);
  }
});

// 2. List all new posts across all channels
app.openapi(createRoute({
    operationId: 'getChannelsMessagesAll',
  method: 'get',
  path: '/channels/messages/all',
  responses: {
    200: { description: 'List of new messages across all channels', content: { 'application/json': { schema: z.array(MessageSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const discord = await createDiscordApiClient(c.env);
    const guilds = await discord.getGuilds();
    
    let allMessages: z.infer<typeof MessageSchema>[] = [];
    for (const guild of guilds) {
      const channels = await discord.getGuildChannels(guild.id);
      // Filter for text-based channels (Type 0 = GUILD_TEXT)
      const textChannels = channels.filter(ch => ch.type === 0);
      
      // Fetch latest 5 messages per channel to avoid aggressive rate-limiting
      for (const channel of textChannels) {
        try {
          const messages = await discord.getChannelMessages(channel.id, 5);
          allMessages = allMessages.concat(messages);
        } catch {
          console.warn(`Could not fetch messages for channel ${channel.id}`);
        }
      }
    }
    return c.json(allMessages, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch cross-channel messages', details: err.message }, 500);
  }
});

// 3. List all new posts within a given channel
app.openapi(createRoute({
    operationId: 'getChannelsChannelIdMessages',
  method: 'get',
  path: '/channels/{channelId}/messages',
  request: { params: z.object({ channelId: z.string() }) },
  responses: {
    200: { description: 'Messages from a specific channel', content: { 'application/json': { schema: z.array(MessageSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const { channelId } = c.req.valid('param');
    const discord = await createDiscordApiClient(c.env);
    const messages = await discord.getChannelMessages(channelId, 50);
    return c.json(messages, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch channel messages', details: err.message }, 500);
  }
});

// 4. Pull all sub-channel (threads) new posts
app.openapi(createRoute({
    operationId: 'getThreadsMessagesAll',
  method: 'get',
  path: '/threads/messages/all',
  responses: {
    200: { description: 'Messages across all active threads', content: { 'application/json': { schema: z.array(MessageSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const discord = await createDiscordApiClient(c.env);
    const guilds = await discord.getGuilds();
    
    let allThreadMessages: z.infer<typeof MessageSchema>[] = [];
    for (const guild of guilds) {
      const { threads } = await discord.getActiveThreads(guild.id);
      for (const thread of threads) {
        try {
          const messages = await discord.getChannelMessages(thread.id, 10);
          allThreadMessages = allThreadMessages.concat(messages);
        } catch {
          console.warn(`Could not fetch messages for thread ${thread.id}`);
        }
      }
    }
    return c.json(allThreadMessages, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch thread messages', details: err.message }, 500);
  }
});

// 5. Search across all sub channels
app.openapi(createRoute({
    operationId: 'getThreadsMessagesSearch',
  method: 'get',
  path: '/threads/messages/search',
  request: { query: z.object({ query: z.string() }) },
  responses: {
    200: { description: 'Filtered messages across all active threads', content: { 'application/json': { schema: z.array(MessageSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const { query } = c.req.valid('query');
    const discord = await createDiscordApiClient(c.env);
    const guilds = await discord.getGuilds();
    
    let searchResults: z.infer<typeof MessageSchema>[] = [];
    const searchRegex = new RegExp(query, 'i');

    for (const guild of guilds) {
      const { threads } = await discord.getActiveThreads(guild.id);
      for (const thread of threads) {
        try {
          const messages = await discord.getChannelMessages(thread.id, 50);
          const matched = messages.filter(m => searchRegex.test(m.content));
          searchResults = searchResults.concat(matched);
        } catch {
          console.warn(`Could not fetch messages for thread ${thread.id}`);
        }
      }
    }
    return c.json(searchResults, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to search thread messages', details: err.message }, 500);
  }
});

// 6. Pull all new posts from specified sub channel
app.openapi(createRoute({
    operationId: 'getThreadsThreadIdMessages',
  method: 'get',
  path: '/threads/{threadId}/messages',
  request: { params: z.object({ threadId: z.string() }) },
  responses: {
    200: { description: 'Messages from a specific thread', content: { 'application/json': { schema: z.array(MessageSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const { threadId } = c.req.valid('param');
    const discord = await createDiscordApiClient(c.env);
    // Threads utilize the exact same message endpoint as standard channels
    const messages = await discord.getChannelMessages(threadId, 50);
    return c.json(messages, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch thread messages', details: err.message }, 500);
  }
});

// 7. Search across specified sub channel
app.openapi(createRoute({
    operationId: 'getThreadsThreadIdSearch',
  method: 'get',
  path: '/threads/{threadId}/search',
  request: { 
    params: z.object({ threadId: z.string() }),
    query: z.object({ query: z.string() })
  },
  responses: {
    200: { description: 'Filtered messages from a specific thread', content: { 'application/json': { schema: z.array(MessageSchema) } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorSchema } } }
  }
}), async (c) => {
  try {
    const { threadId } = c.req.valid('param');
    const { query } = c.req.valid('query');
    const discord = await createDiscordApiClient(c.env);
    
    const messages = await discord.getChannelMessages(threadId, 100);
    const searchRegex = new RegExp(query, 'i');
    const searchResults = messages.filter(m => searchRegex.test(m.content));
    
    return c.json(searchResults, 200);
  } catch (err: any) {
    return c.json({ error: 'Failed to search specific thread', details: err.message }, 500);
  }
});

export default app;
