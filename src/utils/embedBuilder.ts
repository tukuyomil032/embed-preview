import { EmbedBuilder, type Guild, type Message, type TextBasedChannel } from "discord.js";

export function createPreviewEmbed(
  message: Message,
  channel: TextBasedChannel & { name?: string | null },
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setDescription(message.content || "*[No content]*")
    .setColor(0x5865f2)
    .setTimestamp(message.createdAt);

  embed.setAuthor({
    name: message.author.displayName || "Unknown",
    iconURL: message.author.displayAvatarURL() || undefined,
  });

  const guild = message.guild as Guild | null;
  embed.setFooter({
    text: `#${channel.name ?? "unknown"} | ${guild?.name ?? "Unknown"}`,
    iconURL: guild?.iconURL() ?? undefined,
  });

  if (message.reactions.cache.size > 0) {
    const reactionsText = message.reactions.cache
      .map((r) => `${r.emoji.toString()} ${r.count}`)
      .join(" ");
    if (reactionsText) {
      embed.addFields({ name: "Reactions", value: reactionsText, inline: false });
    }
  }

  const nonImageAttachments = [...message.attachments.values()].filter(
    (a) => !a.contentType?.startsWith("image/"),
  );
  if (nonImageAttachments.length > 0) {
    embed.addFields({
      name: "Attachments",
      value: nonImageAttachments.map((a) => a.name).join("\n"),
      inline: false,
    });
  }

  return embed;
}
