import { ActionRowBuilder, AttachmentBuilder } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/fetcher.ts", () => ({ fetchTargetMessage: vi.fn() }));
vi.mock("../src/utils/imageGrid.ts", () => ({ composeGridImage: vi.fn() }));

import { fetchTargetMessage } from "../src/utils/fetcher.ts";
import { composeGridImage } from "../src/utils/imageGrid.ts";
import { buildPreviewPayload, previewMessageLink } from "../src/utils/previewCore.ts";

function makeMockMessage(overrides: Record<string, unknown> = {}) {
  return {
    content: "テストメッセージ",
    createdAt: new Date("2024-01-01"),
    author: {
      displayName: "TestUser",
      displayAvatarURL: () => "https://example.com/avatar.png",
    },
    guild: {
      name: "TestGuild",
      iconURL: () => null,
    },
    reactions: { cache: new Map() },
    attachments: new Map(),
    ...overrides,
  };
}

function makeMockChannel() {
  return { name: "general" };
}

function makeAttachment(url: string, contentType: string) {
  return { url, contentType };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildPreviewPayload", () => {
  it("画像添付が0枚の場合はbaseEmbedのみでimage未設定", async () => {
    const payload = await buildPreviewPayload(
      makeMockMessage() as never,
      makeMockChannel() as never,
      "g1",
      "c1",
      "m1",
    );

    expect(payload.embeds).toHaveLength(1);
    expect(payload.files).toHaveLength(0);
    expect(payload.embeds[0]?.toJSON().image).toBeUndefined();
  });

  it("画像添付が1枚の場合はbaseEmbedにimageが設定される", async () => {
    const attachments = new Map([
      ["a1", makeAttachment("https://cdn.example.com/img1.png", "image/png")],
    ]);
    const payload = await buildPreviewPayload(
      makeMockMessage({ attachments }) as never,
      makeMockChannel() as never,
      "g1",
      "c1",
      "m1",
    );

    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0]?.toJSON().image?.url).toBe("https://cdn.example.com/img1.png");
    expect(payload.files).toHaveLength(0);
  });

  it("画像添付が2枚以上でグリッド合成成功時はattachment://grid.pngを参照する", async () => {
    vi.mocked(composeGridImage).mockResolvedValueOnce(
      new AttachmentBuilder(Buffer.from("grid"), { name: "grid.png" }),
    );
    const attachments = new Map([
      ["a1", makeAttachment("https://cdn.example.com/1.png", "image/png")],
      ["a2", makeAttachment("https://cdn.example.com/2.png", "image/png")],
    ]);

    const payload = await buildPreviewPayload(
      makeMockMessage({ attachments }) as never,
      makeMockChannel() as never,
      "g1",
      "c1",
      "m1",
    );

    expect(payload.files).toHaveLength(1);
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0]?.toJSON().image?.url).toBe("attachment://grid.png");
  });

  it("グリッド合成失敗時は各画像を個別embedにフォールバックする", async () => {
    vi.mocked(composeGridImage).mockRejectedValueOnce(new Error("compose failed"));
    const attachments = new Map([
      ["a1", makeAttachment("https://cdn.example.com/1.png", "image/png")],
      ["a2", makeAttachment("https://cdn.example.com/2.png", "image/png")],
      ["a3", makeAttachment("https://cdn.example.com/3.png", "image/png")],
    ]);

    const payload = await buildPreviewPayload(
      makeMockMessage({ attachments }) as never,
      makeMockChannel() as never,
      "g1",
      "c1",
      "m1",
    );

    expect(payload.files).toHaveLength(0);
    expect(payload.embeds).toHaveLength(3);
    expect(payload.embeds[0]?.toJSON().image?.url).toBe("https://cdn.example.com/1.png");
    expect(payload.embeds[1]?.toJSON().image?.url).toBe("https://cdn.example.com/2.png");
    expect(payload.embeds[1]?.toJSON().color).toBe(0x5865f2);
    expect(payload.embeds[2]?.toJSON().image?.url).toBe("https://cdn.example.com/3.png");
  });

  it("動画添付が5本以上ある場合はVideosフィールドが先頭4本のみでjoinされる", async () => {
    const attachments = new Map(
      Array.from({ length: 5 }, (_, i) => [
        `v${i}`,
        makeAttachment(`https://cdn.example.com/v${i}.mp4`, "video/mp4"),
      ]),
    );

    const payload = await buildPreviewPayload(
      makeMockMessage({ attachments }) as never,
      makeMockChannel() as never,
      "g1",
      "c1",
      "m1",
    );

    const fields = payload.embeds[0]?.toJSON().fields;
    const expectedValue = [0, 1, 2, 3]
      .map((i) => `[Video](https://cdn.example.com/v${i}.mp4)`)
      .join("\n");
    expect(fields).toContainEqual({ name: "Videos", value: expectedValue, inline: false });
  });

  it("componentsはoriginalUrlを持つActionRowBuilderの配列になる", async () => {
    const payload = await buildPreviewPayload(
      makeMockMessage() as never,
      makeMockChannel() as never,
      "g1",
      "c1",
      "m1",
    );

    expect(payload.components).toHaveLength(1);
    expect(payload.components[0]).toBeInstanceOf(ActionRowBuilder);
    const [, linkBtn] = payload.components[0]!.toJSON().components;
    expect(linkBtn).toMatchObject({ url: "https://discord.com/channels/g1/c1/m1" });
  });
});

describe("previewMessageLink", () => {
  it("fetchTargetMessageがnullの場合はreplyしない", async () => {
    vi.mocked(fetchTargetMessage).mockResolvedValueOnce(null);
    const sourceMessage = { reply: vi.fn() };

    await previewMessageLink({} as never, sourceMessage as never, "g1", "c1", "m1");

    expect(sourceMessage.reply).not.toHaveBeenCalled();
  });

  it("正常系ではsourceMessage.replyがpayload形状で呼ばれる", async () => {
    vi.mocked(fetchTargetMessage).mockResolvedValueOnce({
      message: makeMockMessage() as never,
      channel: makeMockChannel() as never,
      guild: {} as never,
    });
    const sourceMessage = { reply: vi.fn().mockResolvedValue(undefined) };

    await previewMessageLink({} as never, sourceMessage as never, "g1", "c1", "m1");

    expect(sourceMessage.reply).toHaveBeenCalledWith({
      embeds: expect.any(Array),
      files: expect.any(Array),
      components: expect.any(Array),
    });
  });

  it("sourceMessage.replyが失敗しても例外を投げずconsole.errorが呼ばれる", async () => {
    vi.mocked(fetchTargetMessage).mockResolvedValueOnce({
      message: makeMockMessage() as never,
      channel: makeMockChannel() as never,
      guild: {} as never,
    });
    const sourceMessage = { reply: vi.fn().mockRejectedValue(new Error("reply failed")) };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      previewMessageLink({} as never, sourceMessage as never, "g1", "c1", "m1"),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
