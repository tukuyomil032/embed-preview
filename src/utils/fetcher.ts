import { type Client, type Guild, type Message, type TextBasedChannel } from "discord.js";

type FetchResult = {
  message: Message;
  channel: TextBasedChannel;
  guild: Guild;
} | null;

export async function fetchTargetMessage(
  client: Client,
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<FetchResult> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.warn(`[fetcher] Guild not found: ${guildId}`);
    return null;
  }

  let channel: TextBasedChannel | null = null;
  try {
    const raw = guild.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));
    if (raw && "messages" in raw) {
      channel = raw as TextBasedChannel;
    }
  } catch (err) {
    console.warn(`[fetcher] Failed to fetch channel ${channelId}:`, err);
    return null;
  }

  if (!channel) return null;

  let message: Message | null = null;
  try {
    message = await (
      channel as TextBasedChannel & {
        messages: { fetch: (id: string) => Promise<Message> };
      }
    ).messages.fetch(messageId);
  } catch (err) {
    console.debug(
      `[fetcher] Message ${messageId} not in channel ${channelId}, searching threads:`,
      err,
    );
  }

  if (!message) {
    try {
      const active = await guild.fetchActiveThreads();
      for (const thread of active.threads.values()) {
        try {
          message = await thread.messages.fetch(messageId);
          channel = thread;
          break;
        } catch {
          // このスレッドにはない、次へ
        }
      }
    } catch (err) {
      console.warn(`[fetcher] Failed to fetch active threads for guild ${guildId}:`, err);
    }
  }

  if (!message) {
    console.debug(`[fetcher] Message ${messageId} not found in guild ${guildId}`);
    return null;
  }
  return { message, channel, guild };
}
