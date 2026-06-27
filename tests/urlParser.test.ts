import { describe, expect, it } from "vitest";
import { extractMessageLinks } from "../src/utils/urlParser.ts";

describe("extractMessageLinks", () => {
  it("discord.com URLを検知する", () => {
    const result = extractMessageLinks("https://discord.com/channels/123/456/789");
    expect(result).toEqual([{ guildId: "123", channelId: "456", messageId: "789" }]);
  });

  it("discordapp.com URLを検知する", () => {
    const result = extractMessageLinks("https://discordapp.com/channels/111/222/333");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      guildId: "111",
      channelId: "222",
      messageId: "333",
    });
  });

  it("canary.discord.com URLを検知する", () => {
    const result = extractMessageLinks("https://canary.discord.com/channels/1/2/3");
    expect(result).toHaveLength(1);
  });

  it("ptb.discord.com URLを検知する", () => {
    const result = extractMessageLinks("https://ptb.discord.com/channels/1/2/3");
    expect(result).toHaveLength(1);
  });

  it("複数URLを検知する", () => {
    const result = extractMessageLinks(
      "見て https://discord.com/channels/1/2/3 と https://discord.com/channels/4/5/6",
    );
    expect(result).toHaveLength(2);
  });

  it("URLなしは空配列を返す", () => {
    expect(extractMessageLinks("普通のメッセージ")).toEqual([]);
  });

  it("不正なURLは検知しない", () => {
    expect(extractMessageLinks("https://discord.com/channels/abc")).toEqual([]);
  });
});
