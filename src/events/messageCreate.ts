import { Events, type Client, type Message } from "discord.js";
import { extractMessageLinks } from "../utils/urlParser.ts";
import { previewMessageLink } from "../utils/previewCore.ts";
import { settingsManager } from "../utils/settingsManager.ts";

export function registerMessageCreateEvent(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;
    if (!client.user) return;

    const mention1 = `<@${client.user.id}> `;
    const mention2 = `<@!${client.user.id}> `;
    if (!message.content.startsWith(mention1) && !message.content.startsWith(mention2)) {
      return;
    }

    const links = extractMessageLinks(message.content);
    if (links.length === 0) return;

    if (message.guildId) {
      try {
        await settingsManager.load();
      } catch (err) {
        console.error("[messageCreate] Failed to load settings:", err);
      }
      const roleIds = message.member?.roles?.cache?.map((r) => r.id) || [];
      if (
        !settingsManager.isAllowed(message.guildId, message.channelId, message.author.id, roleIds)
      ) {
        return;
      }
    }

    for (const link of links) {
      try {
        await previewMessageLink(client, message, link.guildId, link.channelId, link.messageId);
      } catch (err) {
        console.error("[messageCreate] Failed to preview message link:", err);
      }
    }
  });
}
