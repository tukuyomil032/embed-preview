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
  await interaction.deferReply();

  const link = interaction.options.getString("link", true);
  const links = extractMessageLinks(link);

  if (links.length === 0) {
    await interaction.followUp({
      content: "Invalid message link.",
      ephemeral: true,
    });
    return;
  }

  const { guildId, channelId, messageId } = links[0]!;
  const result = await fetchTargetMessage(client, guildId, channelId, messageId);

  if (!result) {
    await interaction.followUp({
      content: "Message not found.",
      ephemeral: true,
    });
    return;
  }

  const { message, channel } = result;
  const payload = await buildPreviewPayload(message, channel, guildId, channelId, messageId);

  await interaction.followUp({
    embeds: payload.embeds,
    files: payload.files,
    components: payload.components,
  });
}

export async function registerSlashCommands(client: Client, token: string): Promise<void> {
  const rest = new REST().setToken(token);
  const clientId = client.user?.id;
  if (!clientId) return;

  await rest.put(Routes.applicationCommands(clientId), {
    body: [previewCommand.toJSON()],
  });
}
