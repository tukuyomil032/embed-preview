import type { Client, Message } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/previewCore.ts", () => ({ previewMessageLink: vi.fn() }));

import { registerMessageCreateEvent } from "../src/events/messageCreate.ts";
import { previewMessageLink } from "../src/utils/previewCore.ts";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerMessageCreateEvent", () => {
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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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
