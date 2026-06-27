import { Events, type Client, type Message } from "discord.js";
import { extractMessageLinks } from "../utils/urlParser.ts";
import { previewMessageLink } from "../utils/previewCore.ts";

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

    for (const link of links) {
      await previewMessageLink(client, message, link.guildId, link.channelId, link.messageId);
    }
  });
}
