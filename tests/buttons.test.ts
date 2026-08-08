import { ButtonStyle } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  isOpenOriginalButton,
  makeMessageButtons,
  resolveOriginalUrlFromButtonInteraction,
} from "../src/utils/buttons.ts";

describe("makeMessageButtons", () => {
  it("開くボタン、リンクボタン、削除ボタンの3つを含む", () => {
    const row = makeMessageButtons("https://discord.com/channels/1/2/3");
    const data = row.toJSON();
    expect(data.components).toHaveLength(3);
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

  it("3つ目はdelete_preview削除ボタン", () => {
    const row = makeMessageButtons("https://discord.com/channels/1/2/3");
    const [, , delBtn] = row.toJSON().components;
    expect(delBtn).toMatchObject({
      custom_id: "delete_preview",
      style: ButtonStyle.Danger,
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

describe("resolveOriginalUrlFromButtonInteraction", () => {
  it("components[0].components[1].urlがあればそのURLを返す", () => {
    const interaction = {
      message: { components: [{ components: [{}, { url: "https://example.com/x" }] }] },
    };
    expect(resolveOriginalUrlFromButtonInteraction(interaction as never)).toBe(
      "https://example.com/x",
    );
  });

  it("rowにcomponentsが無ければフォールバック文字列を返す", () => {
    const interaction = { message: { components: [{ type: "not-a-row" }] } };
    expect(resolveOriginalUrlFromButtonInteraction(interaction as never)).toBe(
      "メッセージリンクが見つかりません",
    );
  });

  it("components[0]自体が無ければフォールバック文字列を返す", () => {
    const interaction = { message: { components: [] } };
    expect(resolveOriginalUrlFromButtonInteraction(interaction as never)).toBe(
      "メッセージリンクが見つかりません",
    );
  });

  it("urlがnullならフォールバック文字列を返す", () => {
    const interaction = {
      message: { components: [{ components: [{}, { url: null }] }] },
    };
    expect(resolveOriginalUrlFromButtonInteraction(interaction as never)).toBe(
      "メッセージリンクが見つかりません",
    );
  });
});
