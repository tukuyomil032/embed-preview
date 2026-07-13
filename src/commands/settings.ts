import {
  type ChatInputCommandInteraction,
  type Client,
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageFlags,
  type StringSelectMenuInteraction,
} from "discord.js";
import { settingsManager, type GuildSettings } from "../utils/settingsManager.ts";

export const settingCommand = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("Configure the bot settings")
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("The type of list to configure")
      .setRequired(false)
      .addChoices(
        { name: "whitelist", value: "whitelist" },
        { name: "blacklist", value: "blacklist" },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName("action")
      .setDescription("The action to perform (add or remove)")
      .setRequired(false)
      .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }),
  )
  .addChannelOption((opt) =>
    opt.setName("channel").setDescription("The channel to add or remove").setRequired(false),
  )
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user to add or remove").setRequired(false),
  )
  .addRoleOption((opt) =>
    opt.setName("role").setDescription("The role to add or remove").setRequired(false),
  );

export async function handleSettingCommand(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    try {
      await interaction.reply({
        content: "このコマンドはサーバー内でのみ実行できます。",
        ephemeral: true,
      });
    } catch (err) {
      console.error("[settings] Failed to send guild-only error response:", err);
    }
    return;
  }

  const type = interaction.options.getString("type") as "whitelist" | "blacklist" | null;
  const action = interaction.options.getString("action") as "add" | "remove" | null;
  const channel = interaction.options.getChannel("channel");
  const user = interaction.options.getUser("user");
  const role = interaction.options.getRole("role");

  const hasType = type !== null;
  const hasAction = action !== null;
  const hasTarget = channel !== null || user !== null || role !== null;

  // 1. もし引数が「すべて空」なら、対話的UIを返す
  if (!hasType && !hasAction && !hasTarget) {
    try {
      await interaction.deferReply({ flags: [MessageFlags.IsComponentsV2] } as any);
      await settingsManager.load();
      const settings = settingsManager.getSettings(guildId);
      const components = buildSettingsComponents(interaction.client, interaction.guild, settings);
      await interaction.followUp({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
    } catch (err) {
      console.error("[settings] Failed to send interactive settings UI:", err);
      try {
        await interaction.followUp({
          content: "設定画面の表示中にエラーが発生しました。",
          ephemeral: true,
        });
      } catch (followUpErr) {
        console.error("[settings] Failed to send fallback error response:", followUpErr);
      }
    }
    return;
  }

  // 2. もし type または action が指定されているが、channel、user、role のいずれも指定されていない場合は、エラーメッセージを返す。
  if ((hasType || hasAction) && !hasTarget) {
    try {
      await interaction.reply({
        content:
          "設定を変更するには、変更対象（チャンネル、ユーザー、またはロール）を指定してください。",
        ephemeral: true,
      });
    } catch (err) {
      console.error("[settings] Failed to send validation error response:", err);
    }
    return;
  }

  // 3. もし channel、user、role のいずれかが指定されているが、type または action が指定されていない場合も、エラーメッセージを返す。
  if (hasTarget && (!hasType || !hasAction)) {
    try {
      await interaction.reply({
        content: "設定を変更するには、type と action の両方を指定してください。",
        ephemeral: true,
      });
    } catch (err) {
      console.error("[settings] Failed to send validation error response:", err);
    }
    return;
  }

  try {
    await interaction.deferReply();
  } catch (err) {
    console.error("[settings] Failed to defer reply:", err);
    return;
  }

  try {
    // 設定のロード
    await settingsManager.load();
    const settings = settingsManager.getSettings(guildId);
    const list = settings[type!];
    const responseParts: string[] = [];

    if (channel) {
      const channelName =
        "name" in channel && channel.name ? `#${channel.name}` : `チャンネル <#${channel.id}>`;
      if (action === "add") {
        if (!list.channels.includes(channel.id)) {
          list.channels.push(channel.id);
        }
        responseParts.push(
          `チャンネル ${channelName} を${type === "whitelist" ? "ホワイトリスト" : "ブラックリスト"}に追加しました。`,
        );
      } else {
        list.channels = list.channels.filter((id) => id !== channel.id);
        responseParts.push(
          `チャンネル ${channelName} を${type === "whitelist" ? "ホワイトリスト" : "ブラックリスト"}から削除しました。`,
        );
      }
    }

    if (user) {
      const userName = user.tag;
      if (action === "add") {
        if (!list.users.includes(user.id)) {
          list.users.push(user.id);
        }
        responseParts.push(
          `ユーザー ${userName} を${type === "whitelist" ? "ホワイトリスト" : "ブラックリスト"}に追加しました。`,
        );
      } else {
        list.users = list.users.filter((id) => id !== user.id);
        responseParts.push(
          `ユーザー ${userName} を${type === "whitelist" ? "ホワイトリスト" : "ブラックリスト"}から削除しました。`,
        );
      }
    }

    if (role) {
      const roleName = `@${role.name}`;
      if (action === "add") {
        if (!list.roles.includes(role.id)) {
          list.roles.push(role.id);
        }
        responseParts.push(
          `ロール ${roleName} を${type === "whitelist" ? "ホワイトリスト" : "ブラックリスト"}に追加しました。`,
        );
      } else {
        list.roles = list.roles.filter((id) => id !== role.id);
        responseParts.push(
          `ロール ${roleName} を${type === "whitelist" ? "ホワイトリスト" : "ブラックリスト"}から削除しました。`,
        );
      }
    }

    // 設定の保存
    await settingsManager.setSettings(guildId, settings);

    const finalMessage = responseParts.join("\n");
    await interaction.followUp({ content: finalMessage });
  } catch (err) {
    console.error("[settings] Error processing settings command:", err);
    try {
      await interaction.followUp({
        content: "設定の保存中にエラーが発生しました。",
        ephemeral: true,
      });
    } catch (followUpErr) {
      console.error("[settings] Failed to send fallback error response:", followUpErr);
    }
  }
}

function getChannelLabel(guild: any, id: string): string {
  const channel = guild?.channels.cache.get(id);
  return channel ? `#${channel.name}` : `ID: ${id}`;
}

function getUserLabel(client: Client, guild: any, id: string): string {
  const member = guild?.members.cache.get(id);
  if (member) return member.user.tag;
  const user = client.users.cache.get(id);
  if (user) return user.tag;
  return `ID: ${id}`;
}

function getRoleLabel(guild: any, id: string): string {
  const role = guild?.roles.cache.get(id);
  return role ? `@${role.name}` : `ID: ${id}`;
}

export function buildSettingsComponents(
  client: Client,
  guild: any,
  settings: GuildSettings,
): any[] {
  const { blacklist, whitelist } = settings;

  const blacklistText = new TextDisplayBuilder().setContent(
    `**ブラックリスト (Blacklist)**\n` +
      `• チャンネル: ${blacklist.channels.length > 0 ? blacklist.channels.map((id) => `<#${id}>`).join(", ") : "なし"}\n` +
      `• ユーザー: ${blacklist.users.length > 0 ? blacklist.users.map((id) => `<@${id}>`).join(", ") : "なし"}\n` +
      `• ロール: ${blacklist.roles.length > 0 ? blacklist.roles.map((id) => `<@&${id}>`).join(", ") : "なし"}`,
  );

  const whitelistText = new TextDisplayBuilder().setContent(
    `**ホワイトリスト (Whitelist)**\n` +
      `• チャンネル: ${whitelist.channels.length > 0 ? whitelist.channels.map((id) => `<#${id}>`).join(", ") : "なし"}\n` +
      `• ユーザー: ${whitelist.users.length > 0 ? whitelist.users.map((id) => `<@${id}>`).join(", ") : "なし"}\n` +
      `• ロール: ${whitelist.roles.length > 0 ? whitelist.roles.map((id) => `<@&${id}>`).join(", ") : "なし"}`,
  );

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2) // Blurple
    .addTextDisplayComponents(blacklistText)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(whitelistText);

  const options: { label: string; value: string }[] = [];

  blacklist.channels.forEach((id) => {
    options.push({
      label: `Blacklist - Channel: ${getChannelLabel(guild, id)}`,
      value: `blacklist:channels:${id}`,
    });
  });
  blacklist.users.forEach((id) => {
    options.push({
      label: `Blacklist - User: ${getUserLabel(client, guild, id)}`,
      value: `blacklist:users:${id}`,
    });
  });
  blacklist.roles.forEach((id) => {
    options.push({
      label: `Blacklist - Role: ${getRoleLabel(guild, id)}`,
      value: `blacklist:roles:${id}`,
    });
  });

  whitelist.channels.forEach((id) => {
    options.push({
      label: `Whitelist - Channel: ${getChannelLabel(guild, id)}`,
      value: `whitelist:channels:${id}`,
    });
  });
  whitelist.users.forEach((id) => {
    options.push({
      label: `Whitelist - User: ${getUserLabel(client, guild, id)}`,
      value: `whitelist:users:${id}`,
    });
  });
  whitelist.roles.forEach((id) => {
    options.push({
      label: `Whitelist - Role: ${getRoleLabel(guild, id)}`,
      value: `whitelist:roles:${id}`,
    });
  });

  const components: any[] = [container];

  if (options.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("settings_remove")
      .setPlaceholder("削除する項目を選択してください")
      .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    components.push(row);
  }

  return components;
}

export async function handleSettingsRemoveInteraction(
  interaction: StringSelectMenuInteraction,
  _client: Client,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    try {
      await interaction.reply({
        content: "この操作はサーバー内でのみ実行できます。",
        ephemeral: true,
      });
    } catch (err) {
      console.error("[settings_remove] Failed to send guild-only error response:", err);
    }
    return;
  }

  const selectedValue = interaction.values[0];
  if (!selectedValue) {
    try {
      await interaction.reply({
        content: "削除対象が選択されていません。",
        ephemeral: true,
      });
    } catch (err) {
      console.error("[settings_remove] Failed to send error response:", err);
    }
    return;
  }

  try {
    const [type, listType, id] = selectedValue.split(":");
    if (
      (type !== "whitelist" && type !== "blacklist") ||
      (listType !== "channels" && listType !== "users" && listType !== "roles") ||
      !id
    ) {
      throw new Error(`Invalid selected value format: ${selectedValue}`);
    }

    await settingsManager.load();
    const settings = settingsManager.getSettings(guildId);

    const list = settings[type];
    if (list && list[listType]) {
      list[listType] = list[listType].filter((existingId) => existingId !== id);
    }

    await settingsManager.setSettings(guildId, settings);

    const components = buildSettingsComponents(interaction.client, interaction.guild, settings);

    await interaction.update({
      components,
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (err) {
    console.error("[settings_remove] Error processing setting removal:", err);
    try {
      await interaction.reply({
        content: "項目の削除中にエラーが発生しました。",
        ephemeral: true,
      });
    } catch (replyErr) {
      console.error("[settings_remove] Failed to send fallback error response:", replyErr);
    }
  }
}
