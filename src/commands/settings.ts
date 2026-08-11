import {
  type ChatInputCommandInteraction,
  type Client,
  SlashCommandBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ThumbnailBuilder,
  ActionRowBuilder,
  ModalBuilder,
  LabelBuilder,
  CheckboxGroupBuilder,
  CheckboxGroupOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { settingsManager, type GuildSettings, type ListConfig } from "../utils/settingsManager.ts";

/**
 * Session store for pending delete operations.
 * Maps a short session key to the resolved IDs at confirmation time,
 * preventing TOCTOU issues from index-based deletion.
 * Entries expire after 5 minutes.
 */
const PENDING_DELETE_TTL_MS = 5 * 60 * 1000;
const pendingDeletes = new Map<string, { ids: Set<string>; listType: string; createdAt: number }>();

function createPendingDeleteKey(listType: string, idsToRemove: Set<string>): string {
  const key = `${listType}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  pendingDeletes.set(key, { ids: idsToRemove, listType, createdAt: Date.now() });
  // Cleanup expired entries
  for (const [k, v] of pendingDeletes) {
    if (Date.now() - v.createdAt > PENDING_DELETE_TTL_MS) pendingDeletes.delete(k);
  }
  return key;
}

/** Exported for testing */
export { pendingDeletes };

const createToggleButton = (): ButtonBuilder =>
  new ButtonBuilder()
    .setCustomId("settings:toggle_mode")
    .setLabel("Switch mode")
    .setStyle(ButtonStyle.Primary);

const createActionButtons = (): ButtonBuilder[] => [
  new ButtonBuilder()
    .setCustomId("settings:action_add")
    .setEmoji("✅")
    .setLabel("Add")
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId("settings:action_delete")
    .setEmoji("🗑️")
    .setLabel("Delete")
    .setStyle(ButtonStyle.Danger),
];

const createBackButton = (): ButtonBuilder =>
  new ButtonBuilder()
    .setCustomId("settings:main")
    .setEmoji("⬅️")
    .setLabel("Back")
    .setStyle(ButtonStyle.Secondary);

export const settingCommand = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("Configure the bot settings")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export function buildMainSettingsComponents(guild: any): any[] {
  const container = new ContainerBuilder().setAccentColor(0x4169e1);
  if (guild?.iconURL()) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Embed Preview Bot Settings For "${guild?.name}"\n\nPlease select the item to configure.`,
          ),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(guild.iconURL() as string)),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Embed Preview Bot Settings For "${guild?.name}"\n\nPlease select the item to configure.`,
      ),
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "### Blacklist / Whitelist\n\nYou can configure blacklists or whitelists for users, roles, and channels.",
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setEmoji("➡️")
            .setCustomId("settings:black_white")
            .setStyle(ButtonStyle.Primary),
        ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# You can close this settings screen at any time by pressing "Dismiss Message" below.`,
      ),
    );

  return [container];
}

export function hasManageGuildPermission(interaction: any): boolean {
  if (!interaction?.memberPermissions || typeof interaction.memberPermissions.has !== "function") {
    return false;
  }
  return (
    interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions.has(PermissionFlagsBits.Administrator)
  );
}

export async function handleSettingCommand(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    try {
      await interaction.reply({
        content: "This command can only be used within a server.",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      console.error("[settings] Failed to send guild-only error response:", err);
    }
    return;
  }

  if (!hasManageGuildPermission(interaction)) {
    try {
      await interaction.reply({
        content:
          "You do not have permission to manage settings (Manage Server permission required).",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      console.error("[settings] Failed to send permission error response:", err);
    }
    return;
  }

  try {
    const components = buildMainSettingsComponents(interaction.guild);
    await interaction.reply({
      components,
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
  } catch (err) {
    console.error("[settings] Error processing settings command:", err);
    try {
      await interaction.followUp({
        content: "An error occurred while displaying the settings screen.",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (followUpErr) {
      console.error("[settings] Failed to send fallback error response:", followUpErr);
    }
  }
}

function extractFieldValues(fields: any, targetCustomId: string): string[] {
  if (!fields) return [];
  const results: string[] = [];

  try {
    if (typeof fields.getChannelSelectMenuValues === "function") {
      const v = fields.getChannelSelectMenuValues(targetCustomId);
      if (Array.isArray(v) && v.length > 0) return v;
    }
    if (typeof fields.getUserSelectMenuValues === "function") {
      const v = fields.getUserSelectMenuValues(targetCustomId);
      if (Array.isArray(v) && v.length > 0) return v;
    }
    if (typeof fields.getRoleSelectMenuValues === "function") {
      const v = fields.getRoleSelectMenuValues(targetCustomId);
      if (Array.isArray(v) && v.length > 0) return v;
    }
    if (typeof fields.getStringSelectMenuValues === "function") {
      const v = fields.getStringSelectMenuValues(targetCustomId);
      if (Array.isArray(v) && v.length > 0) return v;
    }
    if (typeof fields.getCheckboxGroup === "function") {
      const v = fields.getCheckboxGroup(targetCustomId);
      if (Array.isArray(v) && v.length > 0) return v;
    }
    if (typeof fields.getCheckboxGroupValues === "function") {
      const v = fields.getCheckboxGroupValues(targetCustomId);
      if (Array.isArray(v) && v.length > 0) return v;
    }
    if (typeof fields.getTextInputValue === "function") {
      const v = fields.getTextInputValue(targetCustomId);
      if (typeof v === "string" && v.length > 0) return [v];
    }
  } catch (err) {
    console.debug("[extractFieldValues] Failed method lookup for %s:", targetCustomId, err);
  }

  try {
    const rawFields = fields.fields || fields.components;
    if (rawFields) {
      const list =
        typeof rawFields.values === "function"
          ? Array.from(rawFields.values())
          : Array.isArray(rawFields)
            ? rawFields
            : [];
      for (const item of list as any[]) {
        if (item && item.customId === targetCustomId) {
          if (Array.isArray(item.values) && item.values.length > 0) return item.values;
          if (typeof item.value === "string" && item.value.length > 0) return [item.value];
          if (Array.isArray(item.selected) && item.selected.length > 0) return item.selected;
        }
      }
    }
  } catch (err) {
    console.debug("[extractFieldValues] Failed rawFields inspection for %s:", targetCustomId, err);
  }

  try {
    const directObj = fields[targetCustomId] || fields.getField?.(targetCustomId);
    if (directObj) {
      if (Array.isArray(directObj.values)) return directObj.values;
      if (typeof directObj.value === "string") return [directObj.value];
    }
  } catch (err) {
    console.debug("[extractFieldValues] Failed directObj lookup for %s:", targetCustomId, err);
  }

  return results;
}

function isConfirmed(fields: any, confirmCustomId: string): boolean {
  const vals = extractFieldValues(fields, confirmCustomId);
  if (vals.length > 0) return true;

  try {
    const rawFields = fields?.fields || fields?.components;
    if (rawFields) {
      const list =
        typeof rawFields.values === "function"
          ? Array.from(rawFields.values())
          : Array.isArray(rawFields)
            ? rawFields
            : [];
      for (const item of list as any[]) {
        if (
          item &&
          typeof item.customId === "string" &&
          (item.customId === confirmCustomId || item.customId.startsWith(`${confirmCustomId}:`))
        ) {
          if (
            (Array.isArray(item.values) && item.values.length > 0) ||
            (typeof item.value === "string" && item.value.length > 0)
          ) {
            return true;
          }
        }
      }
    }
  } catch (err) {
    console.debug("[isConfirmed] Failed rawFields inspection for %s:", confirmCustomId, err);
  }

  return false;
}

/**
 * Handles component interactions for adding/removing items to/from whitelist or blacklist,
 * and navigating between settings screens.
 */
export async function handleSettingsInteraction(interaction: any, _client: Client): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    try {
      await interaction.reply({
        content: "This operation can only be performed within a server.",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      console.error("[settings_interaction] Failed to send guild-only error response:", err);
    }
    return;
  }

  if (!hasManageGuildPermission(interaction)) {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content:
            "You do not have permission to manage settings (Manage Server permission required).",
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        await interaction.reply({
          content:
            "You do not have permission to manage settings (Manage Server permission required).",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch (err) {
      console.error("[settings_interaction] Failed to send permission error response:", err);
    }
    return;
  }

  try {
    await settingsManager.load();
    const settings = settingsManager.getSettings(guildId);
    const customId = interaction.customId;

    if (typeof customId === "string" && customId === "settings:main") {
      const components = buildMainSettingsComponents(interaction.guild);
      await interaction.update({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    if (typeof customId === "string" && customId === "settings:black_white") {
      const components = buildSettingsComponents(_client, interaction.guild, settings);
      await interaction.update({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    if (
      typeof customId === "string" &&
      (customId.startsWith("settings:back") || customId === "settings:action_back")
    ) {
      if (customId === "settings:back_to_black_white") {
        const components = buildSettingsComponents(_client, interaction.guild, settings);
        await interaction.update({
          components,
          flags: [MessageFlags.IsComponentsV2],
        });
        return;
      }

      if (customId === "settings:back_to_select_target_delete") {
        const components = buildSelectTargetListComponents("delete");
        await interaction.update({
          components,
          flags: [MessageFlags.IsComponentsV2],
        });
        return;
      }

      if (customId === "settings:back_to_select_target_add") {
        const components = buildSelectTargetListComponents("add");
        await interaction.update({
          components,
          flags: [MessageFlags.IsComponentsV2],
        });
        return;
      }

      if (customId.startsWith("settings:back_to_delete_list:")) {
        const listType = customId.split(":")[2] as "whitelist" | "blacklist";
        const components = await buildDeleteFallbackComponents(
          listType,
          settings,
          interaction.guild,
        );
        await interaction.update({
          components,
          flags: [MessageFlags.IsComponentsV2],
        });
        return;
      }

      const components = buildMainSettingsComponents(interaction.guild);
      await interaction.update({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    if (typeof customId === "string" && customId === "settings_modal:black_white") {
      if (isConfirmed(interaction.fields, "confirm_checkbox")) {
        settings.mode = settings.mode === "blacklist" ? "whitelist" : "blacklist";
        await settingsManager.setSettings(guildId, settings);
      }

      const components = buildSettingsComponents(_client, interaction.guild, settings);
      await interaction.update({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    // Switching Mode Modal
    if (
      typeof customId === "string" &&
      (customId === "settings:toggle_mode" || customId === "settings:open_mode_modal")
    ) {
      const whitelistEntryCount =
        settings.whitelist.channels.length +
        settings.whitelist.users.length +
        settings.whitelist.roles.length;
      const modal = buildModeModal(settings.mode, whitelistEntryCount);
      await interaction.showModal(modal);
      return;
    }

    // Choose target list (update original message)
    if (
      typeof customId === "string" &&
      (customId === "settings:action_add" || customId === "settings:action_delete")
    ) {
      const action = customId === "settings:action_add" ? "add" : "delete";
      const components = buildSelectTargetListComponents(action);
      await interaction.update({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    // Add/Del Modal
    if (typeof customId === "string" && customId.startsWith("settings:select_list:")) {
      const parts = customId.split(":");
      const action = parts[2] as "add" | "delete";
      const listType = parts[3] as "whitelist" | "blacklist";

      if (action === "add") {
        const modal = buildAddModal(listType);
        await interaction.showModal(modal);
        return;
      } else if (action === "delete") {
        const targetList = settings[listType];
        const totalItems =
          targetList.channels.length + targetList.users.length + targetList.roles.length;

        if (totalItems === 0) {
          const container = new ContainerBuilder()
            .setAccentColor(0xff0000)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                "## ⚠️ Error\nThere are no registered items to delete in this list.",
              ),
            );
          await interaction.reply({
            components: [container],
            flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
          });
          return;
        }

        const components = await buildDeleteFallbackComponents(
          listType,
          settings,
          interaction.guild,
        );
        await interaction.update({
          components,
          flags: [MessageFlags.IsComponentsV2],
        });
        return;
      }
    }

    if (typeof customId === "string" && customId.startsWith("settings_modal:add:")) {
      const listType = customId.split(":")[2] as "whitelist" | "blacklist";
      if (listType && settings[listType] && interaction.fields) {
        const hasConfirm = isConfirmed(interaction.fields, "add_confirm");

        if (hasConfirm) {
          const addedChannels = extractFieldValues(interaction.fields, "add_channels");
          const addedUsers = extractFieldValues(interaction.fields, "add_users");
          const addedRoles = extractFieldValues(interaction.fields, "add_roles");

          for (const id of addedChannels) {
            if (!settings[listType].channels.includes(id)) settings[listType].channels.push(id);
          }
          for (const id of addedUsers) {
            if (!settings[listType].users.includes(id)) settings[listType].users.push(id);
          }
          for (const id of addedRoles) {
            if (!settings[listType].roles.includes(id)) settings[listType].roles.push(id);
          }

          await settingsManager.setSettings(guildId, settings);
        }
      }

      const components = buildSettingsComponents(_client, interaction.guild, settings);
      await interaction.update({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    if (typeof customId === "string" && customId.startsWith("settings_modal:delete:")) {
      const listType = customId.split(":")[2] as "whitelist" | "blacklist";
      if (listType && settings[listType] && interaction.fields) {
        const hasConfirm = isConfirmed(interaction.fields, "delete_confirm");

        if (hasConfirm) {
          const selectedValues: string[] = [
            ...extractFieldValues(interaction.fields, "delete_users"),
            ...extractFieldValues(interaction.fields, "delete_roles"),
            ...extractFieldValues(interaction.fields, "delete_channels"),
          ];

          for (const item of selectedValues) {
            const parts = item.split(":");
            if (parts.length >= 3) {
              const targetType = parts[1] as "channels" | "users" | "roles";
              const id = parts[2];
              if (targetType && id && settings[listType][targetType]) {
                settings[listType][targetType] = settings[listType][targetType].filter(
                  (existingId) => existingId !== id,
                );
              }
            }
          }

          await settingsManager.setSettings(guildId, settings);
        }
      }

      const components = buildSettingsComponents(_client, interaction.guild, settings);
      await interaction.update({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    if (typeof customId === "string" && customId.startsWith("settings:prompt_delete_index:")) {
      const listType = customId.split(":")[2] as "whitelist" | "blacklist";
      const modal = buildDeleteByIndexModal(listType);
      await interaction.showModal(modal);
      return;
    }

    if (typeof customId === "string" && customId.startsWith("settings_modal:delete_by_index:")) {
      const listType = customId.split(":")[2] as "whitelist" | "blacklist";
      if (listType && settings[listType] && interaction.fields) {
        const hasConfirm = isConfirmed(interaction.fields, "delete_confirm");

        if (hasConfirm) {
          const indexStr =
            extractFieldValues(interaction.fields, "delete_indices")[0] ||
            interaction.fields.getTextInputValue?.("delete_indices") ||
            "";
          const numbers = (indexStr.match(/\d+/g) || []).map(Number);

          const components = await buildDeleteConfirmComponents(
            listType,
            settings,
            numbers,
            indexStr,
            interaction.guild,
          );
          await interaction.update({
            components,
            flags: [MessageFlags.IsComponentsV2],
          });
          return;
        }
      }

      const components = buildSettingsComponents(_client, interaction.guild, settings);
      await interaction.update({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    if (typeof customId === "string" && customId.startsWith("settings:confirm_delete_yes:")) {
      const parts = customId.split(":");
      const listType = parts[2] as "whitelist" | "blacklist";
      const sessionKey = parts[3] || "";

      if (listType && settings[listType] && sessionKey) {
        const pending = pendingDeletes.get(sessionKey);
        if (pending && pending.listType === listType) {
          const idsToRemove = pending.ids;
          pendingDeletes.delete(sessionKey);

          if (idsToRemove.size > 0) {
            settings[listType].channels = settings[listType].channels.filter(
              (id) => !idsToRemove.has(id),
            );
            settings[listType].users = settings[listType].users.filter(
              (id) => !idsToRemove.has(id),
            );
            settings[listType].roles = settings[listType].roles.filter(
              (id) => !idsToRemove.has(id),
            );
            await settingsManager.setSettings(guildId, settings);
          }
        } else {
          console.warn(
            "[settings_interaction] Pending delete session not found or expired:",
            sessionKey,
          );
        }
      }

      const components = buildSettingsComponents(_client, interaction.guild, settings);
      await interaction.update({
        components,
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    if (typeof customId === "string" && customId.startsWith("settings:confirm_delete_cancel:")) {
      const parts = customId.split(":");
      const listType = parts[2] as "whitelist" | "blacklist";
      const indicesStr = parts[3] || "";

      const modal = buildDeleteByIndexModal(listType, indicesStr);
      await interaction.showModal(modal);
      return;
    }

    const components = buildSettingsComponents(_client, interaction.guild, settings);
    await interaction.update({
      components,
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (err) {
    console.error("[settings_interaction] Error processing settings interaction:", err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "An error occurred while updating the settings.",
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        await interaction.reply({
          content: "An error occurred while updating the settings.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch (replyErr) {
      console.error("[settings_interaction] Failed to send fallback error response:", replyErr);
    }
  }
}

// Builds the UI components for the settings command
export function buildSettingsComponents(
  _client: Client,
  _guild: any,
  settings: GuildSettings,
): any[] {
  const { mode, blacklist, whitelist } = settings;

  const container = new ContainerBuilder().setAccentColor(
    mode === "blacklist" ? 0x000000 : 0xffffff,
  ); // black | white

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("## Blacklist / Whitelist Settings"),
  );

  const modeText = mode === "blacklist" ? "**🚫 Blacklist**" : "**✅ Whitelist**";

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Current Mode: ${modeText}`))
      .setButtonAccessory(createToggleButton()),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
  );

  const MAX_SHOWN = 20;
  const formatIds = (ids: string[], wrap: (id: string) => string): string => {
    if (ids.length === 0) return "None";
    const shown = ids.slice(0, MAX_SHOWN).map(wrap).join(", ");
    return ids.length > MAX_SHOWN ? `${shown} … and ${ids.length - MAX_SHOWN} more` : shown;
  };

  const blacklistSummary =
    `**Blacklist**\n` +
    `• Channels: ${formatIds(blacklist.channels, (id) => `<#${id}>`)}\n` +
    `• Users: ${formatIds(blacklist.users, (id) => `<@${id}>`)}\n` +
    `• Roles: ${formatIds(blacklist.roles, (id) => `<@&${id}>`)}`;

  const whitelistSummary =
    `**Whitelist**\n` +
    `• Channels: ${formatIds(whitelist.channels, (id) => `<#${id}>`)}\n` +
    `• Users: ${formatIds(whitelist.users, (id) => `<@${id}>`)}\n` +
    `• Roles: ${formatIds(whitelist.roles, (id) => `<@&${id}>`)}`;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${blacklistSummary}\n\n${whitelistSummary}`),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
  );

  const action_back_btn_row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    createBackButton(),
    ...createActionButtons(),
  );

  container.addActionRowComponents(action_back_btn_row);

  const components: any[] = [container];

  return components;
}

/**
 * Builds the list selection UI (Choose Blacklist or Whitelist for Add/Delete action)
 */
export function buildSelectTargetListComponents(action: "add" | "delete"): any[] {
  const container = new ContainerBuilder().setAccentColor(0x4169e1);
  const actionTitle = action === "add" ? "Add Items" : "Delete Items";

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${actionTitle}\n\nPlease select which list to target:`),
  );

  const listButtonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`settings:select_list:${action}:blacklist`)
      .setLabel("Blacklist")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`settings:select_list:${action}:whitelist`)
      .setLabel("Whitelist")
      .setStyle(ButtonStyle.Primary),
  );

  const selectTargetBackButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("settings:back_to_black_white")
      .setEmoji("⬅️")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
  );

  container.addActionRowComponents(listButtonsRow);
  container.addActionRowComponents(selectTargetBackButtonRow);

  return [container];
}

/**
 * Builds the modal for adding items (channels, users, roles)
 */
export function buildAddModal(listType: "whitelist" | "blacklist"): ModalBuilder {
  const modal = new ModalBuilder()
    .setTitle(`Add to ${listType === "blacklist" ? "Blacklist" : "Whitelist"}`)
    .setCustomId(`settings_modal:add:${listType}`)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Please select *the users, roles, or channels* to add to **${listType}**.`,
      ),
    )
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Users")
        .setDescription("You can specify up to 25 items.")
        .setUserSelectMenuComponent(
          new UserSelectMenuBuilder()
            .setCustomId("add_users")
            .setPlaceholder("@foo, @bar, ...")
            .setMaxValues(25)
            .setMinValues(1)
            .setRequired(false),
        ),

      new LabelBuilder()
        .setLabel("Roles")
        .setDescription("You can specify up to 25 items.")
        .setRoleSelectMenuComponent(
          new RoleSelectMenuBuilder()
            .setCustomId("add_roles")
            .setPlaceholder("@everyone, @moderators, ...")
            .setMaxValues(25)
            .setMinValues(1)
            .setRequired(false),
        ),

      new LabelBuilder()
        .setLabel("Channels")
        .setDescription("You can specify up to 25 items.")
        .setChannelSelectMenuComponent(
          new ChannelSelectMenuBuilder()
            .setCustomId("add_channels")
            .setPlaceholder("#general, #rule, ...")
            .setMaxValues(25)
            .setMinValues(1)
            .setRequired(false),
        ),

      new LabelBuilder()
        .setLabel("Are you sure you want to add these?")
        .setCheckboxGroupComponent(
          new CheckboxGroupBuilder()
            .setCustomId("add_confirm")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(1)
            .setOptions(
              new CheckboxGroupOptionBuilder().setLabel("Yes, I'll add those.").setValue("Yes"),
            ),
        ),
    );

  return modal;
}

/**
 * Builds the modal for deleting registered items (normal case)
 */
/**
 * Resolves display names for a list's users/roles/channels in a small, fixed
 * number of bulk requests instead of one fetch per item, so this stays well
 * under Discord's 3-second interaction deadline as a list grows.
 */
async function resolveListNames(
  guild: any,
  targetList: ListConfig,
): Promise<{
  users: Map<string, string>;
  roles: Map<string, string>;
  channels: Map<string, string>;
}> {
  const users = new Map<string, string>();
  const roles = new Map<string, string>();
  const channels = new Map<string, string>();

  if (!guild) return { users, roles, channels };

  if (targetList.users.length > 0) {
    try {
      const fetched = await guild.members?.fetch({ user: targetList.users });
      for (const [id, member] of fetched ?? []) {
        users.set(id, member.user?.username || member.displayName || id);
      }
    } catch (err) {
      console.warn("[settings] Failed to bulk-fetch members:", err);
    }
    for (const id of targetList.users) {
      if (users.has(id)) continue;
      const cached = guild.members?.cache?.get(id);
      if (cached) users.set(id, cached.user?.username || cached.displayName || id);
    }
  }

  if (targetList.roles.length > 0) {
    try {
      const fetched = await guild.roles?.fetch();
      for (const id of targetList.roles) {
        const role = fetched?.get(id) ?? guild.roles?.cache?.get(id);
        if (role) roles.set(id, role.name);
      }
    } catch (err) {
      console.warn("[settings] Failed to bulk-fetch roles:", err);
    }
  }

  if (targetList.channels.length > 0) {
    try {
      const fetched = await guild.channels?.fetch();
      for (const id of targetList.channels) {
        const channel = fetched?.get(id) ?? guild.channels?.cache?.get(id);
        if (channel) channels.set(id, channel.name);
      }
    } catch (err) {
      console.warn("[settings] Failed to bulk-fetch channels:", err);
    }
  }

  return { users, roles, channels };
}

export async function buildDeleteModal(
  listType: "whitelist" | "blacklist",
  settings: GuildSettings,
  guild?: any,
): Promise<ModalBuilder> {
  const modal = new ModalBuilder()
    .setTitle(`Delete from ${listType === "blacklist" ? "Blacklist" : "Whitelist"}`)
    .setCustomId(`settings_modal:delete:${listType}`)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Please select *the users, roles, or channels* to delete from **${listType}**.`,
      ),
    );

  const targetList = settings[listType];
  const names = await resolveListNames(guild, targetList);

  const userOptions: StringSelectMenuOptionBuilder[] = [];
  for (const id of targetList.users) {
    const label = `@${names.users.get(id) ?? id} (${id})`.slice(0, 100);
    userOptions.push(
      new StringSelectMenuOptionBuilder().setLabel(label).setValue(`${listType}:users:${id}`),
    );
  }

  const roleOptions: StringSelectMenuOptionBuilder[] = [];
  for (const id of targetList.roles) {
    const label = `@${names.roles.get(id) ?? id} (${id})`.slice(0, 100);
    roleOptions.push(
      new StringSelectMenuOptionBuilder().setLabel(label).setValue(`${listType}:roles:${id}`),
    );
  }

  const channelOptions: StringSelectMenuOptionBuilder[] = [];
  for (const id of targetList.channels) {
    const label = `#${names.channels.get(id) ?? id} (${id})`.slice(0, 100);
    channelOptions.push(
      new StringSelectMenuOptionBuilder().setLabel(label).setValue(`${listType}:channels:${id}`),
    );
  }

  if (userOptions.length > 0) {
    const userSelect = new StringSelectMenuBuilder()
      .setCustomId("delete_users")
      .setPlaceholder("@foo, @bar, ...")
      .setMaxValues(Math.min(userOptions.length, 25))
      .setMinValues(1)
      .setRequired(false)
      .setOptions(userOptions);

    modal.addLabelComponents(
      new LabelBuilder().setLabel("Users").setStringSelectMenuComponent(userSelect),
    );
  }

  if (roleOptions.length > 0) {
    const roleSelect = new StringSelectMenuBuilder()
      .setCustomId("delete_roles")
      .setPlaceholder("@everyone, @moderators, ...")
      .setMaxValues(Math.min(roleOptions.length, 25))
      .setMinValues(1)
      .setRequired(false)
      .setOptions(roleOptions);

    modal.addLabelComponents(
      new LabelBuilder().setLabel("Roles").setStringSelectMenuComponent(roleSelect),
    );
  }

  if (channelOptions.length > 0) {
    const channelSelect = new StringSelectMenuBuilder()
      .setCustomId("delete_channels")
      .setPlaceholder("#general, #rule, ...")
      .setMaxValues(Math.min(channelOptions.length, 25))
      .setMinValues(1)
      .setRequired(false)
      .setOptions(channelOptions);

    modal.addLabelComponents(
      new LabelBuilder().setLabel("Channels").setStringSelectMenuComponent(channelSelect),
    );
  }

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("Are you sure you want to delete these?")
      .setCheckboxGroupComponent(
        new CheckboxGroupBuilder()
          .setCustomId("delete_confirm")
          .setRequired(true)
          .setMinValues(1)
          .setMaxValues(1)
          .setOptions(
            new CheckboxGroupOptionBuilder().setLabel("Yes, I'll delete those.").setValue("Yes"),
          ),
      ),
  );

  return modal;
}

/**
 * Builds the fallback UI when total registered items exceed 25.
 * Displays numbered list in codeblocks and a button to prompt for deletion by index.
 */
export async function buildDeleteFallbackComponents(
  listType: "whitelist" | "blacklist",
  settings: GuildSettings,
  guild?: any,
): Promise<any[]> {
  const container = new ContainerBuilder().setAccentColor(0xed4245);
  const targetList = settings[listType];
  const names = await resolveListNames(guild, targetList);

  let index = 1;
  let textList = `## Registered ${listType === "blacklist" ? "Blacklist" : "Whitelist"} Items\n\n`;

  if (targetList.users.length > 0) {
    const userLines = targetList.users.map(
      (id) => `#${index++} ${names.users.get(id) ?? id} (${id})`,
    );
    textList += `**Users:**\n\`\`\`\n${userLines.join("\n")}\n\`\`\`\n\n`;
  }

  if (targetList.roles.length > 0) {
    const roleLines = targetList.roles.map(
      (id) => `#${index++} ${names.roles.get(id) ?? id} (${id})`,
    );
    textList += `**Roles:**\n\`\`\`\n${roleLines.join("\n")}\n\`\`\`\n\n`;
  }

  if (targetList.channels.length > 0) {
    const channelLines = targetList.channels.map(
      (id) => `#${index++} ${names.channels.get(id) ?? id} (${id})`,
    );
    textList += `**Channels:**\n\`\`\`\n${channelLines.join("\n")}\n\`\`\`\n\n`;
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(textList));

  const navButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("settings:back_to_select_target_delete")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`settings:prompt_delete_index:${listType}`)
      .setLabel("Delete by Item Numbers")
      .setStyle(ButtonStyle.Danger),
  );

  container.addActionRowComponents(navButtonRow);

  return [container];
}

/**
 * Builds the modal for deleting items by index numbers (#1, #2...)
 */
export function buildDeleteByIndexModal(
  listType: "whitelist" | "blacklist",
  initialValue?: string,
): ModalBuilder {
  const indexInput = new TextInputBuilder()
    .setCustomId("delete_indices")
    .setMinLength(1)
    .setRequired(true)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("1, 2, 4, 6, ...");

  if (initialValue) {
    indexInput.setValue(initialValue);
  }

  const modal = new ModalBuilder()
    .setTitle(`Delete by Numbers (${listType})`)
    .setCustomId(`settings_modal:delete_by_index:${listType}`)
    .setLabelComponents(
      new LabelBuilder()
        .setLabel("Enter the item number you want to delete.")
        .setDescription("e.g. 1, 2, 4, 6, ...")
        .setTextInputComponent(indexInput),
      new LabelBuilder()
        .setLabel("Are you sure you want to delete these?")
        .setCheckboxGroupComponent(
          new CheckboxGroupBuilder()
            .setCustomId("delete_confirm")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(1)
            .setOptions(
              new CheckboxGroupOptionBuilder().setLabel("Yes, I'll delete those.").setValue("Yes"),
            ),
        ),
    );

  return modal;
}

/**
 * Builds the confirmation message UI before executing index-based deletion.
 */
export async function buildDeleteConfirmComponents(
  listType: "whitelist" | "blacklist",
  settings: GuildSettings,
  numbers: number[],
  indicesStr: string,
  guild?: any,
): Promise<any[]> {
  const container = new ContainerBuilder().setAccentColor(0xed4245);
  const targetList = settings[listType];
  const names = await resolveListNames(guild, targetList);

  const allItems: { type: "channels" | "users" | "roles"; id: string; num: number }[] = [];
  let index = 1;
  for (const id of targetList.users) allItems.push({ type: "users", id, num: index++ });
  for (const id of targetList.roles) allItems.push({ type: "roles", id, num: index++ });
  for (const id of targetList.channels) allItems.push({ type: "channels", id, num: index++ });

  const selectedItems = allItems.filter((item) => numbers.includes(item.num));

  const lines: string[] = selectedItems.map((item) => {
    const name = names[item.type].get(item.id) ?? item.id;
    const prefix = item.type === "channels" ? "#" : "@";
    return `• #${item.num} ${prefix}${name} (${item.id})`;
  });

  let text = `## ⚠️ Confirmation\nRemove these users, roles, and channels from the list. Are you sure?\n\n**Items for deletion:**\n\`\`\`\n`;
  text += lines.length > 0 ? lines.join("\n") : "No matching items were found.";
  text += `\n\`\`\``;

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

  // Store resolved IDs in session to avoid TOCTOU with index-based deletion
  const idsToRemove = new Set(selectedItems.map((item) => item.id));
  const sessionKey = selectedItems.length > 0 ? createPendingDeleteKey(listType, idsToRemove) : "";

  const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`settings:back_to_delete_list:${listType}`)
      .setLabel("Back")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`settings:confirm_delete_yes:${listType}:${sessionKey}`)
      .setLabel("Yes")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(selectedItems.length === 0),
    new ButtonBuilder()
      .setCustomId(`settings:confirm_delete_cancel:${listType}:${sessionKey}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  container.addActionRowComponents(buttonsRow);
  return [container];
}

/**
 * Builds the mode configuration modal (customId: "settings_modal:black_white").
 * Frontend UI developers can construct and return the ModalBuilder here.
 */
export function buildModeModal(currentMode?: string, whitelistEntryCount = 0): any {
  const switchingToWhitelist = currentMode === "blacklist";
  const modal = new ModalBuilder()
    .setTitle("Confirm")
    .setCustomId("settings_modal:black_white")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(
          switchingToWhitelist
            ? "Really switch to whitelist mode?"
            : "Really switch to blacklist mode?",
        )
        .setCheckboxGroupComponent(
          new CheckboxGroupBuilder()
            .setCustomId("confirm_checkbox")
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true)
            .setOptions(
              new CheckboxGroupOptionBuilder()
                .setLabel(
                  switchingToWhitelist
                    ? "Yes, I will switch to whitelist mode."
                    : "Yes, I will switch to blacklist mode.",
                )
                .setValue("Yes"),
            ),
        ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        switchingToWhitelist
          ? "**When you switch to the whitelist, the bot will operate only for the users, roles, and channels registered on the whitelist. The blacklist still applies on top of it as a deny-list.**"
          : "**When you switch to the blacklist mode, the bot will operate only for users, roles, and channels that are not on the blacklist.**",
      ),
    );

  if (switchingToWhitelist && whitelistEntryCount === 0) {
    modal.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ⚠️ Whitelist currently has 0 entries — the bot will not respond to anyone in this server until you add at least one.`,
      ),
    );
  }

  return modal;
}
