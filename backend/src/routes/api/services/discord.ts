import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { createDiscordApiClient } from '@/services/discord/client';

// ============================================================================
// CLOUDFLARE BINDINGS
// ============================================================================
export interface SecretStoreBinding {
  get(): Promise<string>;
}

export type Bindings = {
  DISCORD_APPLICATION_ID: SecretStoreBinding;
  DISCORD_PUBLIC_KEY: SecretStoreBinding;
  DISCORD_TOKEN: SecretStoreBinding;
};

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

// ============================================================================
// APPLICATION SETUP
// ============================================================================
const app = new OpenAPIHono<{ Bindings: Bindings }>();

// ============================================================================
// DISCORD ROUTES
// ============================================================================

// 1. List of Discord channels the registered user (bot) is following/accessing
app.openapi(createRoute({
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
        } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
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
