import type { ChatInputCommandInteraction, Client } from "discord.js";
import { MessageFlags, REST, Routes } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  handlePreviewCommand,
  previewCommand,
  registerSlashCommands,
} from "../src/commands/preview.ts";
import { settingCommand } from "../src/commands/settings.ts";
import { fetchTargetMessage } from "../src/utils/fetcher.ts";
import { buildPreviewPayload } from "../src/utils/previewCore.ts";
import { settingsManager } from "../src/utils/settingsManager.ts";

vi.mock("../src/utils/fetcher.ts", () => ({ fetchTargetMessage: vi.fn() }));
vi.mock("../src/utils/previewCore.ts", () => ({ buildPreviewPayload: vi.fn() }));
vi.mock("discord.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("discord.js")>();
  return { ...actual, REST: vi.fn() };
});

function createMockInteraction(link: string | null = "https://discord.com/channels/1/2/3") {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const followUp = vi.fn().mockResolvedValue(undefined);
  const getString = vi.fn().mockReturnValue(link);

  return {
    deferReply,
    followUp,
    options: { getString },
  } as unknown as ChatInputCommandInteraction;
}

describe("handlePreviewCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("linkが空の場合はInvalid message linkを返す", async () => {
    const interaction = createMockInteraction(null);

    await handlePreviewCommand(interaction, {} as Client);

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: "Invalid message link.",
      flags: [MessageFlags.Ephemeral],
    });
  });

  it("メッセージ取得失敗時はMessage not foundを返す", async () => {
    const interaction = createMockInteraction();
    vi.mocked(fetchTargetMessage).mockResolvedValue(null);

    await handlePreviewCommand(interaction, {} as Client);

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: "Message not found.",
      flags: [MessageFlags.Ephemeral],
    });
  });

  it("メッセージ取得成功時はbuildPreviewPayloadの返り値をfollowUpに渡す", async () => {
    const interaction = createMockInteraction();
    const targetMsg = {} as never;
    const payload = { embeds: [], files: [], components: [] } as never;

    vi.mocked(fetchTargetMessage).mockResolvedValue({
      message: targetMsg,
      channel: {} as never,
      guild: {} as never,
    });
    vi.mocked(buildPreviewPayload).mockResolvedValue(payload);

    await handlePreviewCommand(interaction, {} as Client);

    expect(buildPreviewPayload).toHaveBeenCalledWith(targetMsg, expect.anything(), "1", "2", "3");
    expect(interaction.followUp).toHaveBeenCalledWith(payload);
  });
});

describe("registerSlashCommands", () => {
  const restInstance = {
    setToken: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    restInstance.setToken.mockReturnValue(restInstance);
    restInstance.put.mockClear();
    restInstance.setToken.mockClear();
    restInstance.setToken.mockReturnValue(restInstance);
    vi.mocked(REST).mockImplementation(function RESTMock() {
      return restInstance as never;
    } as never);
  });

  it("client.userが未設定ならputを呼ばない", async () => {
    await registerSlashCommands({ user: undefined } as unknown as Client, "token");

    expect(restInstance.put).not.toHaveBeenCalled();
  });

  it("client.user.idがある場合はREST.putが呼ばれる", async () => {
    await registerSlashCommands({ user: { id: "app-1" } } as unknown as Client, "token");

    expect(restInstance.setToken).toHaveBeenCalledWith("token");
    expect(restInstance.put).toHaveBeenCalledWith(Routes.applicationCommands("app-1"), {
      body: [previewCommand.toJSON(), settingCommand.toJSON()],
    });
  });
});

const TEST_FILE = path.resolve("tests/temp-preview-settings.json");

describe("Preview Command Integration with Settings", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (settingsManager as any).filepath = TEST_FILE;
    (settingsManager as any).cache = { guilds: {} };
    if (fs.existsSync(TEST_FILE)) {
      await fs.promises.unlink(TEST_FILE);
    }
    await settingsManager.load();
  });

  afterEach(async () => {
    if (fs.existsSync(TEST_FILE)) {
      try {
        await fs.promises.unlink(TEST_FILE);
      } catch {
        // ignore
      }
    }
  });

  function createMockInteraction(options: {
    guildId?: string | null;
    channelId?: string;
    userId?: string;
    roles?: string[] | { cache: Map<string, any> };
    link?: string;
  }) {
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const followUp = vi.fn().mockResolvedValue(undefined);
    const getString = vi.fn().mockImplementation((name: string) => {
      if (name === "link") return options.link ?? "https://discord.com/channels/123/456/789";
      return null;
    });

    return {
      deferReply,
      followUp,
      guildId: options.guildId !== undefined ? options.guildId : "123",
      channelId: options.channelId ?? "456",
      user: { id: options.userId ?? "user_abc" },
      member: {
        roles: options.roles ?? { cache: new Map() },
      },
      options: {
        getString,
      },
    } as unknown as ChatInputCommandInteraction;
  }

  it("should return container error response when settings failed to load (isLoaded is false)", async () => {
    (settingsManager as any).isLoaded = false;
    const interaction = createMockInteraction({
      guildId: "123",
    });

    await handlePreviewCommand(interaction, {} as Client);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(fetchTargetMessage).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
      }),
    );
  });

  it("should allow preview by default if there are no settings restrictions", async () => {
    const interaction = createMockInteraction({
      guildId: "123",
      channelId: "456",
      userId: "user_abc",
    });

    vi.mocked(fetchTargetMessage).mockResolvedValue(null);

    await handlePreviewCommand(interaction, {} as Client);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(fetchTargetMessage).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Message not found." }),
    );
  });

  it("should restrict preview if channel is blacklisted", async () => {
    await settingsManager.load();
    const settings = settingsManager.getSettings("123");
    settings.blacklist.channels.push("456");
    await settingsManager.setSettings("123", settings);

    const interaction = createMockInteraction({
      guildId: "123",
      channelId: "456",
      userId: "user_abc",
    });

    await handlePreviewCommand(interaction, {} as Client);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(fetchTargetMessage).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "このチャンネル、ユーザー、またはロールではプレビューが制限されています。",
        flags: [MessageFlags.Ephemeral],
      }),
    );
  });

  it("should restrict preview if user is blacklisted", async () => {
    await settingsManager.load();
    const settings = settingsManager.getSettings("123");
    settings.blacklist.users.push("user_abc");
    await settingsManager.setSettings("123", settings);

    const interaction = createMockInteraction({
      guildId: "123",
      channelId: "456",
      userId: "user_abc",
    });

    await handlePreviewCommand(interaction, {} as Client);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(fetchTargetMessage).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "このチャンネル、ユーザー、またはロールではプレビューが制限されています。",
        flags: [MessageFlags.Ephemeral],
      }),
    );
  });

  it("should restrict preview if role is blacklisted (cache roles)", async () => {
    await settingsManager.load();
    const settings = settingsManager.getSettings("123");
    settings.blacklist.roles.push("role_bad");
    await settingsManager.setSettings("123", settings);

    const cache = new Map();
    cache.set("role_bad", { id: "role_bad" });
    const interaction = createMockInteraction({
      guildId: "123",
      channelId: "456",
      userId: "user_abc",
      roles: { cache },
    });

    await handlePreviewCommand(interaction, {} as Client);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(fetchTargetMessage).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "このチャンネル、ユーザー、またはロールではプレビューが制限されています。",
        flags: [MessageFlags.Ephemeral],
      }),
    );
  });

  it("should restrict preview if role is blacklisted (array roles)", async () => {
    await settingsManager.load();
    const settings = settingsManager.getSettings("123");
    settings.blacklist.roles.push("role_bad");
    await settingsManager.setSettings("123", settings);

    const interaction = createMockInteraction({
      guildId: "123",
      channelId: "456",
      userId: "user_abc",
      roles: ["role_bad"],
    });

    await handlePreviewCommand(interaction, {} as Client);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(fetchTargetMessage).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "このチャンネル、ユーザー、またはロールではプレビューが制限されています。",
        flags: [MessageFlags.Ephemeral],
      }),
    );
  });

  it("should bypass restrictions if outside a guild (DM)", async () => {
    const interaction = createMockInteraction({
      guildId: null,
      channelId: "dm_chan",
      userId: "user_abc",
    });

    vi.mocked(fetchTargetMessage).mockResolvedValue(null);

    await handlePreviewCommand(interaction, {} as Client);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(fetchTargetMessage).toHaveBeenCalled();
  });
});
