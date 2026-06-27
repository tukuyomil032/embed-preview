import { EmbedBuilder } from "discord.js";
import { describe, expect, it } from "vitest";
import { createPreviewEmbed } from "../src/utils/embedBuilder.ts";

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

describe("createPreviewEmbed", () => {
  it("メッセージ内容がdescriptionに入る", () => {
    const embed = createPreviewEmbed(makeMockMessage() as never, makeMockChannel() as never);
    const data = embed.toJSON();
    expect(data.description).toBe("テストメッセージ");
  });

  it("コンテンツ空は '*[No content]*' になる", () => {
    const embed = createPreviewEmbed(
      makeMockMessage({ content: "" }) as never,
      makeMockChannel() as never,
    );
    expect(embed.toJSON().description).toBe("*[No content]*");
  });

  it("colorが0x5865F2", () => {
    const embed = createPreviewEmbed(makeMockMessage() as never, makeMockChannel() as never);
    expect(embed.toJSON().color).toBe(0x5865f2);
  });

  it("EmbedBuilderを返す", () => {
    const embed = createPreviewEmbed(makeMockMessage() as never, makeMockChannel() as never);
    expect(embed).toBeInstanceOf(EmbedBuilder);
  });
});
