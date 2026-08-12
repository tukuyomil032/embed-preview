import {
  type ChatInputCommandInteraction,
  Client,
  ContainerBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { config } from "dotenv";
import { registerMessageCreateEvent } from "./events/messageCreate.ts";
import { handlePreviewCommand, registerSlashCommands } from "./commands/preview.ts";
import { handleSettingCommand, handleSettingsInteraction } from "./commands/settings.ts";
import {
  isDeletePreviewButton,
  isOpenOriginalButton,
  resolveOriginalUrlFromButtonInteraction,
} from "./utils/buttons.ts";
import { resolveDiscordToken } from "./utils/env.ts";
import { settingsManager } from "./utils/settingsManager.ts";
import { canDeletePreviewFunc } from "./utils/canDeletePreviewUtil.ts";

config();

const TOKEN = resolveDiscordToken(process.env, process.exit);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

registerMessageCreateEvent(client);

client.on(Events.ClientReady, async (readyClient) => {
  console.log(`[index] Bot logged in as ${readyClient.user.tag}`);
  try {
    await settingsManager.load();
    console.log("[index] Settings loaded");
  } catch (err) {
    console.error("[index] Failed to load settings:", err);
  }

  try {
    await registerSlashCommands(readyClient, TOKEN);
    console.log("[index] Slash commands registered");
  } catch (err) {
    console.error("[index] Failed to register slash commands:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "preview") {
      await handlePreviewCommand(interaction as ChatInputCommandInteraction, client);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "settings") {
      await handleSettingCommand(interaction as ChatInputCommandInteraction, client);
      return;
    }

    const isSettingsComponent =
      (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) &&
      (interaction.customId.startsWith("settings:") ||
        interaction.customId.startsWith("settings_modal:"));

    if (isSettingsComponent) {
      await handleSettingsInteraction(interaction, client);
      return;
    }

    if (isOpenOriginalButton(interaction)) {
      const originalUrl = resolveOriginalUrlFromButtonInteraction(interaction);
      await interaction.reply({ content: originalUrl, flags: [MessageFlags.Ephemeral] });
    }

    if (isDeletePreviewButton(interaction)) {
      const canDeletePreviewResult = await canDeletePreviewFunc(interaction, client);
      if (!canDeletePreviewResult.canDeletePreview) {
        const container = new ContainerBuilder()
          .setAccentColor(0xff0000)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              ":warning: Error\nYou don't have enough permission to delete this preview.",
            ),
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# [ref] "Manage messages" permission: :x:`),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# [ref] Preview Invoker: :x:`),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `-# [ref] Owner of the message being previewed: :x:`,
            ),
          );

        await interaction.reply({
          components: [container],
          flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        });
        return;
      }
      const previewMsg = interaction.message;
      try {
        const originalMsg = await interaction.message.fetchReference();
        await originalMsg.delete().catch((err) => {
          console.warn("[index] Failed to delete original message:", err);
        });
        await previewMsg.delete();
      } catch (err) {
        console.warn("[index] Failed to fetch original message:", err);
        await previewMsg.delete();
      }
    }
  } catch (err) {
    console.error("[index] InteractionCreate handler error:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: "Something went wrong. Please try again.",
          flags: [MessageFlags.Ephemeral],
        })
        .catch((replyErr) => console.error("[index] Failed to send error reply:", replyErr));
    }
  }
});

await client.login(TOKEN);
