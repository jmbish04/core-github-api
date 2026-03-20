export interface DiscordUser {
  id: string;
  username: string;
  bot?: boolean;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
  author?: DiscordUser;
}

export interface DiscordChannel {
  id: string;
  name?: string | null;
  type: number;
  guild_id?: string;
  parent_id?: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
}

export interface DiscordTokenSecret {
  get(): Promise<string>;
}

export class DiscordApiClient {
  private readonly baseUrl = 'https://discord.com/api/v10';

  constructor(private readonly token: string) {}

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bot ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (https://cloudflare.com, 1.0.0)',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Discord API Error] ${response.status} on ${endpoint}: ${errorText}`);
      throw new Error(`Discord API Error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async getGuilds(): Promise<DiscordGuild[]> {
    return this.request('/users/@me/guilds');
  }

  async getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    return this.request(`/guilds/${guildId}/channels`);
  }

  async getActiveThreads(guildId: string): Promise<{ threads: DiscordChannel[] }> {
    return this.request(`/guilds/${guildId}/threads/active`);
  }

  async getChannelMessages(channelId: string, limit = 50): Promise<DiscordMessage[]> {
    return this.request(`/channels/${channelId}/messages?limit=${limit}`);
  }
}

export async function resolveDiscordToken(env: { DISCORD_TOKEN: string | DiscordTokenSecret }): Promise<string> {
  const { DISCORD_TOKEN } = env;
  if (typeof DISCORD_TOKEN === 'string') {
    return DISCORD_TOKEN;
  }
  return DISCORD_TOKEN.get();
}

export async function createDiscordApiClient(env: { DISCORD_TOKEN: string | DiscordTokenSecret }): Promise<DiscordApiClient> {
  return new DiscordApiClient(await resolveDiscordToken(env));
}
