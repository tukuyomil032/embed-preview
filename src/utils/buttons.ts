import type { Interaction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction } from "discord.js";

export function makeMessageButtons(originalUrl: string): ActionRowBuilder<ButtonBuilder> {
  const openBtn = new ButtonBuilder()
    .setCustomId("open_original_message")
    .setLabel("Open original message")
    .setStyle(ButtonStyle.Primary);

  const linkBtn = new ButtonBuilder()
    .setLabel("Direct link")
    .setStyle(ButtonStyle.Link)
    .setURL(originalUrl);

  const delBtn = new ButtonBuilder()
    .setCustomId("delete_preview")
    .setEmoji("🗑️")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(openBtn, linkBtn, delBtn);
}

export function isOpenOriginalButton(interaction: Interaction): interaction is ButtonInteraction {
  return interaction.isButton() && interaction.customId === "open_original_message";
}

export function isDeletePreviewButton(interaction: Interaction): interaction is ButtonInteraction {
  return interaction.isButton() && interaction.customId === "delete_preview";
}

export function resolveOriginalUrlFromButtonInteraction(interaction: ButtonInteraction): string {
  const row = interaction.message.components[0];
  const urlComponent = row && "components" in row ? row.components[1] : undefined;
  return urlComponent && "url" in urlComponent && urlComponent.url != null
    ? urlComponent.url
    : "メッセージリンクが見つかりません";
}
