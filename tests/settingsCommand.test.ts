import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type ChatInputCommandInteraction, type Client } from "discord.js";
import {
  buildModeModal,
  buildSettingsComponents,
  handleSettingCommand,
  handleSettingsInteraction,
  pendingDeletes,
} from "../src/commands/settings.ts";
import { createDefaultGuildSettings, settingsManager } from "../src/utils/settingsManager.ts";

const TEST_FILE = path.resolve("tests/temp-command-settings.json");

function createMockInteraction(
  guildId: string | null = "guild_123",
  hasPermissions: boolean = true,
) {
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
    memberPermissions: {
      has: vi.fn().mockReturnValue(hasPermissions),
    },
  } as unknown as ChatInputCommandInteraction;
}

const mockPermissions = { has: vi.fn().mockReturnValue(true) };

describe("設定コマンド バックエンドハンドラー", () => {
  const originalFilepath = (settingsManager as any).filepath;
  const originalCache = (settingsManager as any).cache;
  const originalIsLoaded = (settingsManager as any).isLoaded;

  beforeEach(async () => {
    (settingsManager as any).filepath = TEST_FILE;
    (settingsManager as any).cache = { guilds: {} };
    (settingsManager as any).isLoaded = true;
    pendingDeletes.clear();
    if (fs.existsSync(TEST_FILE)) {
      await fs.promises.unlink(TEST_FILE);
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    (settingsManager as any).filepath = originalFilepath;
    (settingsManager as any).cache = originalCache;
    (settingsManager as any).isLoaded = originalIsLoaded;
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

  it("管理者/ギルド管理権限がない場合はエラーを返す", async () => {
    const interaction = createMockInteraction("guild_123", false);

    await handleSettingCommand(interaction, {} as Client);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "You do not have permission to manage settings (Manage Server permission required).",
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
      memberPermissions: mockPermissions,
      fields: {
        getTextInputValue: vi.fn().mockReturnValue("whitelist"),
        getCheckboxGroup: vi.fn().mockReturnValue(["Yes"]),
      },
      update,
    } as any;

    await handleSettingsInteraction(mockModalSubmitInteraction, {} as Client);

    const settings = settingsManager.getSettings("guild_123");
    expect(settings.mode).toBe("whitelist");

    // Verify disk file updated
    const diskContent = await fs.promises.readFile(TEST_FILE, "utf-8");
    const parsedDisk = JSON.parse(diskContent);
    expect(parsedDisk.guilds["guild_123"]?.mode).toBe("whitelist");

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
      memberPermissions: mockPermissions,
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
      memberPermissions: mockPermissions,
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
      memberPermissions: mockPermissions,
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
      memberPermissions: mockPermissions,
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

    // Extract the session key created by buildDeleteConfirmComponents
    const sessionKey = Array.from(pendingDeletes.keys()).find((k) => k.startsWith("blacklist_"));
    expect(sessionKey).toBeDefined();

    // 2. Cancel ボタン押下時、モーダルが入力値付きで再表示されること
    const mockCancelInteraction = {
      guildId: "guild_123",
      customId: `settings:confirm_delete_cancel:blacklist:${sessionKey}`,
      memberPermissions: mockPermissions,
      showModal,
      update,
    } as any;

    await handleSettingsInteraction(mockCancelInteraction, {} as Client);
    expect(showModal).toHaveBeenCalled();

    // Re-submit to create a new session for the Yes step
    await handleSettingsInteraction(mockDeleteIndexModalSubmit, {} as Client);
    const sessionKey2 = Array.from(pendingDeletes.keys()).find(
      (k) => k.startsWith("blacklist_") && k !== sessionKey,
    );
    expect(sessionKey2).toBeDefined();

    // 3. Yes ボタン押下時、実際の削除が完了すること
    const mockYesInteraction = {
      guildId: "guild_123",
      customId: `settings:confirm_delete_yes:blacklist:${sessionKey2}`,
      memberPermissions: mockPermissions,
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
      memberPermissions: mockPermissions,
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
      memberPermissions: mockPermissions,
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
      memberPermissions: mockPermissions,
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
      memberPermissions: mockPermissions,
      update,
    } as any;
    await handleSettingsInteraction(mockBackToMain, {} as Client);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      }),
    );
  });
});

describe("buildSettingsComponents", () => {
  it("リストが20件を超える場合はサマリーを切り詰めて残数を表示する", () => {
    const settings = createDefaultGuildSettings();
    settings.blacklist.channels = Array.from({ length: 25 }, (_, i) => `chan_${i}`);

    const [container] = buildSettingsComponents({} as any, null, settings);
    const json = (container as any).toJSON();
    const summaryText = json.components
      .filter((c: any) => typeof c.content === "string")
      .map((c: any) => c.content)
      .join("\n");

    expect(summaryText).toContain("and 5 more");
    expect(summaryText).not.toContain("<#chan_24>");
  });

  it("リストが20件以下の場合は省略しない", () => {
    const settings = createDefaultGuildSettings();
    settings.blacklist.users = ["u1", "u2"];

    const [container] = buildSettingsComponents({} as any, null, settings);
    const json = (container as any).toJSON();
    const summaryText = json.components
      .filter((c: any) => typeof c.content === "string")
      .map((c: any) => c.content)
      .join("\n");

    expect(summaryText).toContain("<@u1>");
    expect(summaryText).toContain("<@u2>");
    expect(summaryText).not.toContain("more");
  });
});

describe("buildModeModal", () => {
  function textContents(modal: ReturnType<typeof buildModeModal>): string[] {
    return modal
      .toJSON()
      .components.filter((c: any) => typeof c.content === "string")
      .map((c: any) => c.content as string);
  }

  it("ホワイトリストが0件の状態でホワイトリストへ切り替える場合はロックアウト警告を表示する", () => {
    const modal = buildModeModal("blacklist", 0);
    expect(textContents(modal).some((c) => c.includes("Whitelist currently has 0 entries"))).toBe(
      true,
    );
  });

  it("ホワイトリストに1件以上ある場合は警告を表示しない", () => {
    const modal = buildModeModal("blacklist", 3);
    expect(textContents(modal).some((c) => c.includes("Whitelist currently has 0 entries"))).toBe(
      false,
    );
  });

  it("ブラックリストへ切り替える場合は警告を表示しない", () => {
    const modal = buildModeModal("whitelist", 0);
    expect(textContents(modal).some((c) => c.includes("Whitelist currently has 0 entries"))).toBe(
      false,
    );
  });
});
