import { type ChatInputCommandInteraction, Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { registerMessageCreateEvent } from "./events/messageCreate.ts";
import { handlePreviewCommand, registerSlashCommands } from "./commands/preview.ts";
import { isOpenOriginalButton } from "./utils/buttons.ts";

config();

const TOKEN = process.env["DISCORD_TOKEN"];
if (!TOKEN) {
  console.error("[index] DISCORD_TOKEN is not set in .env");
  process.exit(1);
}

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
  await registerSlashCommands(readyClient, TOKEN);
  console.log("[index] Slash commands registered");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "preview") {
    await handlePreviewCommand(interaction as ChatInputCommandInteraction, client);
    return;
  }

  if (isOpenOriginalButton(interaction)) {
    const row = interaction.message.components[0];
    const urlComponent = row && "components" in row ? row.components[1] : undefined;
    const originalUrl =
      urlComponent && "url" in urlComponent && urlComponent.url != null
        ? urlComponent.url
        : "メッセージリンクが見つかりません";
    await interaction.reply({ content: originalUrl, ephemeral: true });
  }
});

await client.login(TOKEN);
