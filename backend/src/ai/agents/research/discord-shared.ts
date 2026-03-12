import { z } from 'zod';
import { createDiscordApiClient, type DiscordChannel, type DiscordGuild, type DiscordMessage } from '@/services/discord/client';

export const DiscordResearchPayloadSchema = z.object({
  query: z.string().min(1),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  maxMessagesPerChannel: z.number().int().min(1).max(100).default(25),
  maxChannels: z.number().int().min(1).max(20).default(10),
});

export type DiscordResearchPayload = z.infer<typeof DiscordResearchPayloadSchema>;

export interface DiscordResearchMatch {
  guildId?: string;
  guildName?: string;
  channelId: string;
  channelName?: string | null;
  messageId: string;
  author?: string;
  content: string;
  timestamp: string;
}

export interface DiscordResearchCorpus {
  query: string;
  scannedGuilds: number;
  scannedChannels: number;
  scannedMessages: number;
  matches: DiscordResearchMatch[];
}

function toTextChannels(channels: DiscordChannel[]): DiscordChannel[] {
  return channels.filter((channel) => channel.type === 0);
}

function buildMatch(channel: DiscordChannel, message: DiscordMessage, guild?: DiscordGuild): DiscordResearchMatch {
  return {
    guildId: guild?.id,
    guildName: guild?.name,
    channelId: channel.id,
    channelName: channel.name,
    messageId: message.id,
    author: message.author?.username,
    content: message.content,
    timestamp: message.timestamp,
  };
}

export async function collectDiscordResearchCorpus(env: { DISCORD_TOKEN: string | { get(): Promise<string> } }, payload: DiscordResearchPayload): Promise<DiscordResearchCorpus> {
  const discord = await createDiscordApiClient(env);
  const normalized = DiscordResearchPayloadSchema.parse(payload);
  const matcher = new RegExp(normalized.query, 'i');

  let scannedGuilds = 0;
  let scannedChannels = 0;
  let scannedMessages = 0;
  const matches: DiscordResearchMatch[] = [];

  const searchChannel = async (channel: DiscordChannel, guild?: DiscordGuild) => {
    const messages = await discord.getChannelMessages(channel.id, normalized.maxMessagesPerChannel);
    scannedMessages += messages.length;
    for (const message of messages) {
      if (matcher.test(message.content)) {
        matches.push(buildMatch(channel, message, guild));
      }
    }
  };

  if (normalized.channelId) {
    scannedChannels = 1;
    await searchChannel({ id: normalized.channelId, type: 0, guild_id: normalized.guildId });
    return {
      query: normalized.query,
      scannedGuilds,
      scannedChannels,
      scannedMessages,
      matches,
    };
  }

  const guilds = normalized.guildId
    ? (await discord.getGuilds()).filter((guild) => guild.id === normalized.guildId)
    : await discord.getGuilds();

  scannedGuilds = guilds.length;

  for (const guild of guilds) {
    const channels = toTextChannels(await discord.getGuildChannels(guild.id)).slice(0, normalized.maxChannels);
    scannedChannels += channels.length;
    for (const channel of channels) {
      await searchChannel(channel, guild);
    }
  }

  return {
    query: normalized.query,
    scannedGuilds,
    scannedChannels,
    scannedMessages,
    matches,
  };
}
