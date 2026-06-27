import {
  type ActionRowBuilder,
  AttachmentBuilder,
  type ButtonBuilder,
  type Client,
  EmbedBuilder,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { makeMessageButtons } from "./buttons.ts";
import { createPreviewEmbed } from "./embedBuilder.ts";
import { fetchTargetMessage } from "./fetcher.ts";
import { composeGridImage } from "./imageGrid.ts";

type PreviewPayload = {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

export async function buildPreviewPayload(
  message: Message,
  channel: TextBasedChannel & { name?: string | null },
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<PreviewPayload> {
  const baseEmbed = createPreviewEmbed(message, channel);

  const imageAttachments = [...message.attachments.values()].filter((a) =>
    a.contentType?.startsWith("image/"),
  );
  const videoAttachments = [...message.attachments.values()].filter((a) =>
    a.contentType?.startsWith("video/"),
  );

  const embeds: EmbedBuilder[] = [];
  const files: AttachmentBuilder[] = [];

  if (imageAttachments.length === 1) {
    const first = imageAttachments[0];
    if (first) baseEmbed.setImage(first.url);
    embeds.push(baseEmbed);
  } else if (imageAttachments.length > 1) {
    try {
      const gridFile = await composeGridImage(imageAttachments.slice(0, 4));
      files.push(gridFile);
      baseEmbed.setImage("attachment://grid.png");
      embeds.push(baseEmbed);
    } catch (err) {
      console.warn(
        "[previewCore] Grid image composition failed, falling back to individual embeds:",
        err,
      );
      const first = imageAttachments[0];
      if (first) baseEmbed.setImage(first.url);
      embeds.push(baseEmbed);
      for (const att of imageAttachments.slice(1, 4)) {
        embeds.push(new EmbedBuilder().setColor(0x5865f2).setImage(att.url));
      }
    }
  } else {
    embeds.push(baseEmbed);
  }

  if (videoAttachments.length > 0) {
    const videoLinks = videoAttachments
      .slice(0, 4)
      .map((v) => `[Video](${v.url})`)
      .join("\n");
    baseEmbed.addFields({ name: "Videos", value: videoLinks, inline: false });
  }

  const originalUrl = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
  const components = [makeMessageButtons(originalUrl)];

  return { embeds, files, components };
}

export async function previewMessageLink(
  client: Client,
  sourceMessage: Message,
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  const result = await fetchTargetMessage(client, guildId, channelId, messageId);
  if (!result) return;

  const { message, channel } = result;
  const payload = await buildPreviewPayload(message, channel, guildId, channelId, messageId);

  await sourceMessage.reply({
    embeds: payload.embeds,
    files: payload.files,
    components: payload.components,
  });
}
