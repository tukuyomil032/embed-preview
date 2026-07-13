import { type ChatInputCommandInteraction, Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { registerMessageCreateEvent } from "./events/messageCreate.ts";
import { handlePreviewCommand, registerSlashCommands } from "./commands/preview.ts";
import { isOpenOriginalButton, resolveOriginalUrlFromButtonInteraction } from "./utils/buttons.ts";
import { resolveDiscordToken } from "./utils/env.ts";

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

    if (isOpenOriginalButton(interaction)) {
      const originalUrl = resolveOriginalUrlFromButtonInteraction(interaction);
      await interaction.reply({ content: originalUrl, ephemeral: true });
    }
  } catch (err) {
    console.error("[index] InteractionCreate handler error:", err);
  }
});

await client.login(TOKEN);
