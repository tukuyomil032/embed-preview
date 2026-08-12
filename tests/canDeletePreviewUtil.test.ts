import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { canDeletePreviewFunc } from "../src/utils/canDeletePreviewUtil.ts";
import * as fetcherModule from "../src/utils/fetcher.ts";

describe("canDeletePreviewFunc", () => {
  const dummyClient = {} as any;

  it("ボタン押下者が ManageMessages 権限を持っていれば canDeletePreview: true を返す", async () => {
    const interaction = {
      user: { id: "user_other" },
      memberPermissions: {
        has: (permission: any) => permission === PermissionFlagsBits.ManageMessages,
      },
    } as any;

    const result = await canDeletePreviewFunc(interaction, dummyClient);
    expect(result).toEqual({ canDeletePreview: true });
  });

  it("メンション経由の呼び出し主 (fetchReference 成功) であれば canDeletePreview: true を返す", async () => {
    const interaction = {
      user: { id: "invoker_user_id" },
      memberPermissions: { has: () => false },
      message: {
        fetchReference: vi.fn().mockResolvedValue({
          author: { id: "invoker_user_id" },
        }),
      },
    } as any;

    const result = await canDeletePreviewFunc(interaction, dummyClient);
    expect(result).toEqual({ canDeletePreview: true });
  });

  it("スラッシュコマンド経由の呼び出し主 (interactionMetadata) であれば canDeletePreview: true を返す", async () => {
    const interaction = {
      user: { id: "slash_invoker_id" },
      memberPermissions: { has: () => false },
      message: {
        fetchReference: vi.fn().mockRejectedValue(new Error("No reference")),
        interactionMetadata: {
          user: { id: "slash_invoker_id" },
        },
      },
    } as any;

    const result = await canDeletePreviewFunc(interaction, dummyClient);
    expect(result).toEqual({ canDeletePreview: true });
  });

  it("プレビュー対象メッセージの作成者であれば canDeletePreview: true を返す", async () => {
    const interaction = {
      user: { id: "original_author_id" },
      memberPermissions: { has: () => false },
      message: {
        fetchReference: vi.fn().mockRejectedValue(new Error("No reference")),
        components: [
          {
            components: [{}, { url: "https://discord.com/channels/12345/67890/11111" }],
          },
        ],
      },
    } as any;

    vi.spyOn(fetcherModule, "fetchTargetMessage").mockResolvedValue({
      message: { author: { id: "original_author_id" } },
    } as any);

    const result = await canDeletePreviewFunc(interaction, dummyClient);
    expect(result).toEqual({ canDeletePreview: true });
  });

  it("いずれの権限も持たない第三者の場合は canDeletePreview: false と reason を返す", async () => {
    const interaction = {
      user: { id: "random_third_party_id" },
      memberPermissions: { has: () => false },
      message: {
        fetchReference: vi.fn().mockRejectedValue(new Error("No reference")),
        components: [
          {
            components: [{}, { url: "https://discord.com/channels/12345/67890/11111" }],
          },
        ],
      },
    } as any;

    vi.spyOn(fetcherModule, "fetchTargetMessage").mockResolvedValue({
      message: { author: { id: "original_author_id" } },
    } as any);

    const result = await canDeletePreviewFunc(interaction, dummyClient);
    expect(result).toEqual({
      canDeletePreview: false,
      reason: "not_owner_invoker_or_mod",
    });
  });
});
