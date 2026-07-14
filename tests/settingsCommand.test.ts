import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type ChatInputCommandInteraction, type Client } from "discord.js";
import {
  handleSettingCommand,
  handleSettingsInteraction,
  handleSettingsRemoveInteraction,
} from "../src/commands/settings.ts";
import { settingsManager } from "../src/utils/settingsManager.ts";

const TEST_FILE = path.resolve("tests/temp-command-settings.json");

function createMockInteraction(guildId: string | null = "guild_123") {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const followUp = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(undefined);
  const showModal = vi.fn().mockResolvedValue(undefined);

  return {
    deferReply,
    followUp,
    reply,
    update,
    showModal,
    guildId,
    guild: null,
  } as unknown as ChatInputCommandInteraction;
}

describe("設定コマンド バックエンドハンドラー", () => {
  beforeEach(async () => {
    (settingsManager as any).filepath = TEST_FILE;
    (settingsManager as any).cache = { guilds: {} };
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

  it("ギルド外で実行された場合はエラーを返す", async () => {
    const interaction = createMockInteraction(null);

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "This command can only be used within a server.",
      }),
    );
  });

  it("ギルド内で実行された場合はUIコンポーネントで返答する", async () => {
    const interaction = createMockInteraction("guild_123");

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: expect.arrayContaining([32768]),
      }),
    );
  });

  it("settings_modal:black_white送信時にモードが更新されsettings.jsonに保存される", async () => {
    await settingsManager.load();
    const initSettings = settingsManager.getSettings("guild_123");
    expect(initSettings.mode).toBe("blacklist");

    const update = vi.fn().mockResolvedValue(undefined);
    const mockModalSubmitInteraction = {
      guildId: "guild_123",
      customId: "settings_modal:black_white",
      fields: {
        getTextInputValue: vi.fn().mockReturnValue("whitelist"),
        getCheckboxGroup: vi.fn().mockReturnValue(["Yes"]),
      },
      update,
    } as any;

    await handleSettingsInteraction(mockModalSubmitInteraction, {} as Client);

    const settings = settingsManager.getSettings("guild_123");
    expect(settings.mode).toBe("whitelist");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: expect.arrayContaining([32768]),
      }),
    );
  });

  it("settings_modal:add:blacklist送信時にモーダルの入力値からアイテムが追加される", async () => {
    await settingsManager.load();
    const update = vi.fn().mockResolvedValue(undefined);
    const mockAddModalInteraction = {
      guildId: "guild_123",
      customId: "settings_modal:add:blacklist",
      fields: {
        getCheckboxGroup: vi.fn().mockReturnValue(["Yes"]),
        getChannelSelectMenuValues: vi.fn((id: string) =>
          id === "add_channels" ? ["111122223333"] : [],
        ),
        getUserSelectMenuValues: vi.fn((id: string) =>
          id === "add_users" ? ["444455556666"] : [],
        ),
        getRoleSelectMenuValues: vi.fn((id: string) =>
          id === "add_roles" ? ["777788889999"] : [],
        ),
      },
      update,
    } as any;

    await handleSettingsInteraction(mockAddModalInteraction, {} as Client);

    const settings = settingsManager.getSettings("guild_123");
    expect(settings.blacklist.channels).toContain("111122223333");
    expect(settings.blacklist.users).toContain("444455556666");
    expect(settings.blacklist.roles).toContain("777788889999");
  });

  it("登録アイテムが0件のときに削除を選択した場合はモーダルを表示せずエラーを返信する", async () => {
    await settingsManager.load();
    const reply = vi.fn().mockResolvedValue(undefined);
    const showModal = vi.fn().mockResolvedValue(undefined);

    const mockSelectDeleteZeroInteraction = {
      guildId: "guild_123",
      customId: "settings:select_list:delete:blacklist",
      reply,
      showModal,
    } as any;

    await handleSettingsInteraction(mockSelectDeleteZeroInteraction, {} as Client);

    expect(showModal).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: expect.arrayContaining([64]),
      }),
    );
  });

  it("番号一覧画面が表示され、番号入力Modal送信後に確認画面を経てYes押下で該当アイテムが削除される", async () => {
    await settingsManager.load();
    const settings = settingsManager.getSettings("guild_123");
    settings.blacklist.channels.push("channel_target_1");
    await settingsManager.setSettings("guild_123", settings);

    const update = vi.fn().mockResolvedValue(undefined);
    const showModal = vi.fn().mockResolvedValue(undefined);

    const mockSelectDeleteInteraction = {
      guildId: "guild_123",
      customId: "settings:select_list:delete:blacklist",
      update,
    } as any;

    await handleSettingsInteraction(mockSelectDeleteInteraction, {} as Client);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      }),
    );

    // 1. 番号指定削除 Modal Submit (確認画面へ遷移)
    const mockDeleteIndexModalSubmit = {
      guildId: "guild_123",
      customId: "settings_modal:delete_by_index:blacklist",
      fields: {
        getCheckboxGroup: vi.fn((id: string) => (id === "delete_confirm" ? ["Yes"] : [])),
        getTextInputValue: vi.fn((id: string) => (id === "delete_indices" ? "1" : "")),
      },
      update,
    } as any;

    await handleSettingsInteraction(mockDeleteIndexModalSubmit, {} as Client);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      }),
    );

    // 2. Cancel ボタン押下時、モーダルが入力値付きで再表示されること
    const mockCancelInteraction = {
      guildId: "guild_123",
      customId: "settings:confirm_delete_cancel:blacklist:1",
      showModal,
      update,
    } as any;

    await handleSettingsInteraction(mockCancelInteraction, {} as Client);
    expect(showModal).toHaveBeenCalled();

    // 3. Yes ボタン押下時、実際の削除が完了すること
    const mockYesInteraction = {
      guildId: "guild_123",
      customId: "settings:confirm_delete_yes:blacklist:1",
      update,
    } as any;

    await handleSettingsInteraction(mockYesInteraction, {} as Client);

    const updatedSettings = settingsManager.getSettings("guild_123");
    expect(updatedSettings.blacklist.channels).not.toContain("channel_target_1");
  });

  it("各画面のBackボタンが1つ前の画面に戻るインタラクションを正しく処理する", async () => {
    const update = vi.fn().mockResolvedValue(undefined);

    // 登録アイテム番号一覧画面の Back -> Target List 選択画面
    const mockBackFromDeleteList = {
      guildId: "guild_123",
      customId: "settings:back_to_select_target_delete",
      update,
    } as any;
    await handleSettingsInteraction(mockBackFromDeleteList, {} as Client);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      }),
    );

    // 削除確認画面の Back -> 登録アイテム番号一覧画面
    const mockBackFromConfirm = {
      guildId: "guild_123",
      customId: "settings:back_to_delete_list:blacklist",
      update,
    } as any;
    await handleSettingsInteraction(mockBackFromConfirm, {} as Client);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      }),
    );

    // Add/Delete Items 画面の Back -> Black/whitelist 設定画面
    const mockBackFromSelectTarget = {
      guildId: "guild_123",
      customId: "settings:back_to_black_white",
      update,
    } as any;
    await handleSettingsInteraction(mockBackFromSelectTarget, {} as Client);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      }),
    );

    // Black/whitelist 設定画面の Back (settings:main) -> メイン案内画面
    const mockBackToMain = {
      guildId: "guild_123",
      customId: "settings:main",
      update,
    } as any;
    await handleSettingsInteraction(mockBackToMain, {} as Client);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      }),
    );
  });

  it("settings_removeインタラクションで項目が削除されsettings.jsonから除去される", async () => {
    await settingsManager.load();
    const initSettings = settingsManager.getSettings("guild_123");
    initSettings.blacklist.users.push("user_888");
    await settingsManager.setSettings("guild_123", initSettings);

    const update = vi.fn().mockResolvedValue(undefined);
    const mockRemoveInteraction = {
      guildId: "guild_123",
      customId: "settings_remove",
      values: ["blacklist:users:user_888"],
      update,
    } as any;

    await handleSettingsRemoveInteraction(mockRemoveInteraction, {} as Client);

    const settings = settingsManager.getSettings("guild_123");
    expect(settings.blacklist.users).not.toContain("user_888");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: expect.arrayContaining([32768]),
      }),
    );
  });
});
