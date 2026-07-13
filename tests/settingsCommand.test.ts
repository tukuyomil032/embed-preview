import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type ChatInputCommandInteraction, type Client } from "discord.js";
import { handleSettingCommand } from "../src/commands/settings.ts";
import { settingsManager } from "../src/utils/settingsManager.ts";

const TEST_FILE = path.resolve("tests/temp-command-settings.json");

function createMockInteraction(options: {
  guildId?: string | null;
  type?: string | null;
  action?: string | null;
  channel?: { id: string; name?: string } | null;
  user?: { id: string; tag: string } | null;
  role?: { id: string; name: string } | null;
}) {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const followUp = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);

  const getString = vi.fn().mockImplementation((name: string) => {
    if (name === "type") return options.type ?? null;
    if (name === "action") return options.action ?? null;
    return null;
  });

  const getChannel = vi.fn().mockReturnValue(options.channel ?? null);
  const getUser = vi.fn().mockReturnValue(options.user ?? null);
  const getRole = vi.fn().mockReturnValue(options.role ?? null);

  const mockOpts = {
    getString,
    getChannel,
    getUser,
    getRole,
  };

  return {
    deferReply,
    followUp,
    reply,
    guildId: options.guildId !== undefined ? options.guildId : "guild_123",
    options: mockOpts,
  } as unknown as ChatInputCommandInteraction;
}

describe("Settings Command Handler", () => {
  beforeEach(async () => {
    // Redirect SettingsManager singleton filepath to test file
    (settingsManager as any).filepath = TEST_FILE;
    // Reset singleton cache
    (settingsManager as any).cache = { guilds: {} };
    // Clear/ensure test file doesn't exist
    if (fs.existsSync(TEST_FILE)) {
      await fs.promises.unlink(TEST_FILE);
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (fs.existsSync(TEST_FILE)) {
      try {
        await fs.promises.unlink(TEST_FILE);
      } catch {
        // ignore
      }
    }
  });

  it("should fail when executed outside a guild", async () => {
    const interaction = createMockInteraction({
      guildId: null,
      type: "blacklist",
      action: "add",
      channel: { id: "123", name: "general" },
    });

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "このコマンドはサーバー内でのみ実行できます。",
        ephemeral: true,
      }),
    );
  });

  it("should fail when type/action specified but no target specified", async () => {
    const interaction = createMockInteraction({
      type: "blacklist",
      action: "add",
      channel: null,
      user: null,
      role: null,
    });

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "設定を変更するには、変更対象（チャンネル、ユーザー、またはロール）を指定してください。",
        ephemeral: true,
      }),
    );
  });

  it("should fail when target specified but type/action is missing", async () => {
    const interaction = createMockInteraction({
      type: null,
      action: "add",
      channel: { id: "chan_1", name: "general" },
    });

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "設定を変更するには、type と action の両方を指定してください。",
        ephemeral: true,
      }),
    );
  });

  it("should catch errors during settingsManager.load and send fallback error message", async () => {
    const interaction = createMockInteraction({
      type: "blacklist",
      action: "add",
      channel: { id: "chan_123", name: "general" },
    });

    vi.spyOn(settingsManager, "load").mockRejectedValue(new Error("Disk read error"));

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "設定の保存中にエラーが発生しました。",
        ephemeral: true,
      }),
    );
  });

  it("should successfully add channel to blacklist", async () => {
    const interaction = createMockInteraction({
      type: "blacklist",
      action: "add",
      channel: { id: "chan_123", name: "general" },
    });

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: "チャンネル #general をブラックリストに追加しました。",
    });

    // Check saved config
    const settings = settingsManager.getSettings("guild_123");
    expect(settings.blacklist.channels).toContain("chan_123");
  });

  it("should successfully remove channel from blacklist", async () => {
    // Setup initial state
    await settingsManager.load();
    const initSettings = settingsManager.getSettings("guild_123");
    initSettings.blacklist.channels.push("chan_123");
    await settingsManager.setSettings("guild_123", initSettings);

    const interaction = createMockInteraction({
      type: "blacklist",
      action: "remove",
      channel: { id: "chan_123", name: "general" },
    });

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: "チャンネル #general をブラックリストから削除しました。",
    });

    const settings = settingsManager.getSettings("guild_123");
    expect(settings.blacklist.channels).not.toContain("chan_123");
  });

  it("should successfully add user and role to whitelist", async () => {
    const interaction = createMockInteraction({
      type: "whitelist",
      action: "add",
      user: { id: "user_555", tag: "alice#1234" },
      role: { id: "role_777", name: "Moderator" },
    });

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.followUp).toHaveBeenCalledWith({
      content:
        "ユーザー alice#1234 をホワイトリストに追加しました。\nロール @Moderator をホワイトリストに追加しました。",
    });

    const settings = settingsManager.getSettings("guild_123");
    expect(settings.whitelist.users).toContain("user_555");
    expect(settings.whitelist.roles).toContain("role_777");
  });

  it("should show interactive UI with Container and select menu when all options are empty", async () => {
    await settingsManager.load();
    const initSettings = settingsManager.getSettings("guild_123");
    initSettings.blacklist.channels.push("chan_abc");
    await settingsManager.setSettings("guild_123", initSettings);

    const interaction = createMockInteraction({
      type: null,
      action: null,
      channel: null,
      user: null,
      role: null,
    });

    const mockClient = {
      users: { cache: new Map() },
    } as any;

    await handleSettingCommand(interaction, mockClient);

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: expect.arrayContaining([32768]),
    });
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: expect.arrayContaining([32768]), // MessageFlags.IsComponentsV2
      }),
    );

    const followUpCall = (interaction.followUp as any).mock.calls[0][0];
    const components = followUpCall.components;
    expect(components).toHaveLength(2); // Container and SelectMenu
    expect(components[0].data.type).toBe(17); // ComponentType.Container
    expect(components[1].components[0].data.custom_id).toBe("settings_remove");
  });

  it("should handle settings_remove interaction, remove item and update message", async () => {
    await settingsManager.load();
    const initSettings = settingsManager.getSettings("guild_123");
    initSettings.blacklist.channels.push("chan_to_remove");
    await settingsManager.setSettings("guild_123", initSettings);

    const update = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      users: { cache: new Map() },
    } as any;

    const mockSelectMenuInteraction = {
      guildId: "guild_123",
      values: ["blacklist:channels:chan_to_remove"],
      update,
      isStringSelectMenu: () => true,
      customId: "settings_remove",
      guild: {
        channels: { cache: new Map() },
        members: { cache: new Map() },
        roles: { cache: new Map() },
      },
      client: mockClient,
    } as any;

    const { handleSettingsRemoveInteraction } = await import("../src/commands/settings.ts");
    await handleSettingsRemoveInteraction(mockSelectMenuInteraction, mockClient);

    const settings = settingsManager.getSettings("guild_123");
    expect(settings.blacklist.channels).not.toContain("chan_to_remove");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: expect.arrayContaining([32768]),
      }),
    );

    const updateCall = update.mock.calls[0]?.[0];
    expect(updateCall?.components).toHaveLength(1); // Only Container, no ActionRow with SelectMenu
  });
});
