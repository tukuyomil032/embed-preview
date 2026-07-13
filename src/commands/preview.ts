import {
  type ChatInputCommandInteraction,
  type Client,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { extractMessageLinks } from "../utils/urlParser.ts";
import { fetchTargetMessage } from "../utils/fetcher.ts";
import { buildPreviewPayload } from "../utils/previewCore.ts";
import { settingCommand } from "./settings.ts";
import { settingsManager } from "../utils/settingsManager.ts";

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
  try {
    await interaction.deferReply();
  } catch (err) {
    console.error("[preview] Failed to defer reply:", err);
    return;
  }

  if (interaction.guildId) {
    try {
      await settingsManager.load();
    } catch (err) {
      console.error("[preview] Failed to load settings:", err);
    }
    const memberRoles = interaction.member?.roles;
    const roleIds = Array.isArray(memberRoles)
      ? memberRoles
      : memberRoles
        ? [...(memberRoles as any).cache.keys()]
        : [];
    if (
      !settingsManager.isAllowed(
        interaction.guildId,
        interaction.channelId,
        interaction.user.id,
        roleIds,
      )
    ) {
      try {
        await interaction.followUp({
          content: "このチャンネル、ユーザー、またはロールではプレビューが制限されています。",
          ephemeral: true,
        });
      } catch (err) {
        console.error("[preview] Failed to send permission error response:", err);
      }
      return;
    }
  }

  const link = interaction.options.getString("link", true);
  const links = extractMessageLinks(link);

  if (links.length === 0) {
    try {
      await interaction.followUp({ content: "Invalid message link.", ephemeral: true });
    } catch (err) {
      console.error("[preview] Failed to send invalid-link response:", err);
    }
    return;
  }

  const { guildId, channelId, messageId } = links[0]!;
  const result = await fetchTargetMessage(client, guildId, channelId, messageId);

  if (!result) {
    try {
      await interaction.followUp({ content: "Message not found.", ephemeral: true });
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
