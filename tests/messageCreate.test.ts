import { type Client, type Message, Events } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { registerMessageCreateEvent } from "../src/events/messageCreate.ts";
import { previewMessageLink } from "../src/utils/previewCore.ts";
import { settingsManager } from "../src/utils/settingsManager.ts";

vi.mock("../src/utils/previewCore.ts", () => ({
  previewMessageLink: vi.fn(),
}));

function setup() {
  let handler!: (message: Message) => Promise<void>;
  const client = {
    user: { id: "999" },
    on: vi.fn((_event: unknown, cb: (message: Message) => Promise<void>) => {
      handler = cb;
    }),
  };
  registerMessageCreateEvent(client as unknown as Client);
  return { client: client as unknown as Client, getHandler: () => handler };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    author: { bot: false },
    content: "<@999> https://discord.com/channels/1/2/3",
    ...overrides,
  } as unknown as Message;
}

describe("registerMessageCreateEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bot自身のメッセージは無視する", async () => {
    const { getHandler } = setup();
    await getHandler()(makeMessage({ author: { bot: true } }));

    expect(previewMessageLink).not.toHaveBeenCalled();
  });

  it("行頭メンションで始まらない場合は無視する", async () => {
    const { getHandler } = setup();
    await getHandler()(makeMessage({ content: "https://discord.com/channels/1/2/3" }));

    expect(previewMessageLink).not.toHaveBeenCalled();
  });

  it("メンションのみでリンクがない場合は無視する", async () => {
    const { getHandler } = setup();
    await getHandler()(makeMessage({ content: "<@999> こんにちは" }));

    expect(previewMessageLink).not.toHaveBeenCalled();
  });

  it("メンション+リンク1件の場合はpreviewMessageLinkが1回呼ばれる", async () => {
    const { client, getHandler } = setup();
    const message = makeMessage();

    await getHandler()(message);

    expect(previewMessageLink).toHaveBeenCalledTimes(1);
    expect(previewMessageLink).toHaveBeenCalledWith(client, message, "1", "2", "3");
  });

  it("メンション+リンク2件の場合は順番にpreviewMessageLinkが呼ばれる", async () => {
    const { client, getHandler } = setup();
    const message = makeMessage({
      content: "<@999> https://discord.com/channels/1/2/3 https://discord.com/channels/4/5/6",
    });

    await getHandler()(message);

    expect(previewMessageLink).toHaveBeenCalledTimes(2);
    expect(previewMessageLink).toHaveBeenNthCalledWith(1, client, message, "1", "2", "3");
    expect(previewMessageLink).toHaveBeenNthCalledWith(2, client, message, "4", "5", "6");
  });

  it("1件目のpreviewMessageLinkが失敗しても2件目は呼ばれる", async () => {
    vi.mocked(previewMessageLink)
      .mockRejectedValueOnce(new Error("preview failed"))
      .mockResolvedValueOnce(undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const { getHandler } = setup();
    const message = makeMessage({
      content: "<@999> https://discord.com/channels/1/2/3 https://discord.com/channels/4/5/6",
    });

    await getHandler()(message);

    expect(previewMessageLink).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

const TEST_FILE = path.resolve("tests/temp-message-settings.json");

describe("MessageCreate Event Integration with Settings", () => {
  let client: Client;
  let eventCallback: ((message: Message) => Promise<void>) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    (settingsManager as any).filepath = TEST_FILE;
    (settingsManager as any).cache = { guilds: {} };
    if (fs.existsSync(TEST_FILE)) {
      await fs.promises.unlink(TEST_FILE);
    }

    client = {
      user: { id: "bot_123" },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === Events.MessageCreate) {
          eventCallback = cb;
        }
      }),
    } as unknown as Client;

    registerMessageCreateEvent(client);
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

  function createMockMessage(options: {
    guildId?: string | null;
    channelId?: string;
    userId?: string;
    roles?: string[];
    content?: string;
    bot?: boolean;
  }) {
    const cache = new Map();
    if (options.roles) {
      for (const roleId of options.roles) {
        cache.set(roleId, { id: roleId });
      }
    }
    (cache as any).map = (fn: (val: any, key: any) => any) => {
      return Array.from(cache.values()).map(fn);
    };

    return {
      author: {
        bot: options.bot ?? false,
        id: options.userId ?? "user_abc",
      },
      content: options.content ?? "<@bot_123> https://discord.com/channels/123/456/789",
      guildId: options.guildId !== undefined ? options.guildId : "123",
      channelId: options.channelId ?? "456",
      member: {
        roles: { cache },
      },
    } as unknown as Message;
  }

  it("should trigger preview by default if there are no restrictions", async () => {
    const message = createMockMessage({
      guildId: "123",
      channelId: "456",
      userId: "user_abc",
    });

    expect(eventCallback).toBeDefined();
    await eventCallback!(message);

    expect(previewMessageLink).toHaveBeenCalled();
  });

  it("should block preview if channel is blacklisted", async () => {
    await settingsManager.load();
    const settings = settingsManager.getSettings("123");
    settings.blacklist.channels.push("456");
    await settingsManager.setSettings("123", settings);

    const message = createMockMessage({
      guildId: "123",
      channelId: "456",
      userId: "user_abc",
    });

    expect(eventCallback).toBeDefined();
    await eventCallback!(message);

    expect(previewMessageLink).not.toHaveBeenCalled();
  });

  it("should block preview if user is blacklisted", async () => {
    await settingsManager.load();
    const settings = settingsManager.getSettings("123");
    settings.blacklist.users.push("user_abc");
    await settingsManager.setSettings("123", settings);

    const message = createMockMessage({
      guildId: "123",
      channelId: "456",
      userId: "user_abc",
    });

    expect(eventCallback).toBeDefined();
    await eventCallback!(message);

    expect(previewMessageLink).not.toHaveBeenCalled();
  });

  it("should block preview if role is blacklisted", async () => {
    await settingsManager.load();
    const settings = settingsManager.getSettings("123");
    settings.blacklist.roles.push("role_bad");
    await settingsManager.setSettings("123", settings);

    const message = createMockMessage({
      guildId: "123",
      channelId: "456",
      userId: "user_abc",
      roles: ["role_bad"],
    });

    expect(eventCallback).toBeDefined();
    await eventCallback!(message);

    expect(previewMessageLink).not.toHaveBeenCalled();
  });

  it("should bypass checks if outside a guild (DM)", async () => {
    const message = createMockMessage({
      guildId: null,
      channelId: "dm_chan",
      userId: "user_abc",
    });

    expect(eventCallback).toBeDefined();
    await eventCallback!(message);

    expect(previewMessageLink).toHaveBeenCalled();
  });
});