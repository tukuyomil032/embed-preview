import {
  type ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import { config } from "dotenv";
import { registerMessageCreateEvent } from "./events/messageCreate.ts";
import { handlePreviewCommand, registerSlashCommands } from "./commands/preview.ts";
import { handleSettingCommand, handleSettingsInteraction } from "./commands/settings.ts";
import { isOpenOriginalButton, resolveOriginalUrlFromButtonInteraction } from "./utils/buttons.ts";
import { resolveDiscordToken } from "./utils/env.ts";
import { settingsManager } from "./utils/settingsManager.ts";

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
