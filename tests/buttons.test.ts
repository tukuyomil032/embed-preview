import { ButtonStyle } from "discord.js";
import { describe, expect, it } from "vitest";
import { isOpenOriginalButton, makeMessageButtons } from "../src/utils/buttons.ts";

describe("makeMessageButtons", () => {
  it("開くボタンとリンクボタンの2つを含む", () => {
    const row = makeMessageButtons("https://discord.com/channels/1/2/3");
    const data = row.toJSON();
    expect(data.components).toHaveLength(2);
  });

  it("1つ目は open_original_message ボタン", () => {
    const row = makeMessageButtons("https://discord.com/channels/1/2/3");
    const [openBtn] = row.toJSON().components;
    expect(openBtn).toMatchObject({
      custom_id: "open_original_message",
      label: "Open original message",
      style: ButtonStyle.Primary,
    });
  });

  it("2つ目はoriginalUrlへのリンクボタン", () => {
    const row = makeMessageButtons("https://discord.com/channels/1/2/3");
    const [, linkBtn] = row.toJSON().components;
    expect(linkBtn).toMatchObject({
      label: "Direct link",
      style: ButtonStyle.Link,
      url: "https://discord.com/channels/1/2/3",
    });
  });
});

describe("isOpenOriginalButton", () => {
  it("ボタンかつcustomIdが一致すればtrue", () => {
    const interaction = { isButton: () => true, customId: "open_original_message" };
    expect(isOpenOriginalButton(interaction as never)).toBe(true);
  });

  it("ボタンでなければfalse", () => {
    const interaction = { isButton: () => false, customId: "open_original_message" };
    expect(isOpenOriginalButton(interaction as never)).toBe(false);
  });

  it("ボタンでもcustomIdが違えばfalse", () => {
    const interaction = { isButton: () => true, customId: "something_else" };
    expect(isOpenOriginalButton(interaction as never)).toBe(false);
  });
});
