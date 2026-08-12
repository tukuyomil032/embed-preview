import {
  type ChatInputCommandInteraction,
  type Client,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { extractMessageLinks } from "../utils/urlParser.ts";
import { fetchTargetMessage } from "../utils/fetcher.ts";
import { buildPreviewPayload } from "../utils/previewCore.ts";
import { settingCommand } from "./settings.ts";
import { settingsManager } from "../utils/settingsManager.ts";
import { extractMemberRoleIds } from "../utils/memberUtils.ts";

export const previewCommand = new SlashCommandBuilder()
  .setName("preview")
  .setDescription("Preview a Discord message link")
  .addStringOption((opt) =>
    opt.setName("link").setDescription("Discord message URL").setRequired(true),
  );

export async function handlePreviewCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (interaction.guildId) {
    if (!settingsManager.getIsLoaded()) {
      try {
        const container = new ContainerBuilder()
          .setAccentColor(0xed4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              "Preview feature is restricted. Unable to load settings file.",
            ),
          );
        await interaction.reply({
          components: [container],
          flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
      } catch (err) {
        console.error("[preview] Failed to send settings load error response:", err);
      }
      return;
    }

    const roleIds = extractMemberRoleIds(interaction.member, interaction.guildId);
    if (
      !settingsManager.isAllowed(
        interaction.guildId,
        interaction.channelId,
        interaction.user.id,
        roleIds,
      )
    ) {
      try {
        await interaction.reply({
          content: "Previews are restricted for this channel, user, or role.",
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        console.error("[preview] Failed to send permission error response:", err);
      }
      return;
    }
  }

  try {
    await interaction.deferReply();
  } catch (err) {
    console.error("[preview] Failed to defer reply:", err);
    return;
  }

  const link = interaction.options.getString("link", true);
  const links = extractMessageLinks(link);

  if (links.length === 0) {
    try {
      await interaction.followUp({
        content: "Invalid message link.",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      console.error("[preview] Failed to send invalid-link response:", err);
    }
    return;
  }

  const { guildId, channelId, messageId } = links[0]!;
  const result = await fetchTargetMessage(client, guildId, channelId, messageId);

  if (!result) {
    try {
      await interaction.followUp({
        content: "Message not found.",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      console.error("[preview] Failed to send not-found response:", err);
    }
    return;
  }

  const { message, channel } = result;
  const payload = await buildPreviewPayload(message, channel, guildId, channelId, messageId);

  try {
    await interaction.followUp({
      embeds: payload.embeds,
      files: payload.files,
      components: payload.components,
    });
  } catch (err) {
    console.error("[preview] Failed to send preview response:", err);
  }
}

export async function registerSlashCommands(client: Client, token: string): Promise<void> {
  const rest = new REST().setToken(token);
  const clientId = client.user?.id;
  if (!clientId) return;

  await rest.put(Routes.applicationCommands(clientId), {
    body: [previewCommand.toJSON(), settingCommand.toJSON()],
  });
}
