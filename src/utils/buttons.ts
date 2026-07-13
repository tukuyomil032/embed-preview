import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Interaction,
} from "discord.js";

export function makeMessageButtons(originalUrl: string): ActionRowBuilder<ButtonBuilder> {
  const openBtn = new ButtonBuilder()
    .setCustomId("open_original_message")
    .setLabel("Open original message")
    .setStyle(ButtonStyle.Primary);

  const linkBtn = new ButtonBuilder()
    .setURL(originalUrl)
    .setLabel("Direct link")
    .setStyle(ButtonStyle.Link);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(openBtn, linkBtn);
}

export function isOpenOriginalButton(interaction: Interaction): interaction is ButtonInteraction {
  return interaction.isButton() && interaction.customId === "open_original_message";
}

export function resolveOriginalUrlFromButtonInteraction(interaction: ButtonInteraction): string {
  const row = interaction.message.components[0];
  const urlComponent = row && "components" in row ? row.components[1] : undefined;
  return urlComponent && "url" in urlComponent && urlComponent.url != null
    ? urlComponent.url
    : "メッセージリンクが見つかりません";
}
