import type { ChatInputCommandInteraction, Client } from "discord.js";
import { Routes } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/fetcher.ts", () => ({ fetchTargetMessage: vi.fn() }));
vi.mock("../src/utils/previewCore.ts", () => ({ buildPreviewPayload: vi.fn() }));
vi.mock("discord.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("discord.js")>();
  return { ...actual, REST: vi.fn() };
});

import { REST } from "discord.js";
import {
  handlePreviewCommand,
  previewCommand,
  registerSlashCommands,
} from "../src/commands/preview.ts";
import { fetchTargetMessage } from "../src/utils/fetcher.ts";
import { buildPreviewPayload } from "../src/utils/previewCore.ts";

function makeInteraction(overrides: Record<string, unknown> = {}) {
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    options: { getString: vi.fn().mockReturnValue("https://discord.com/channels/1/2/3") },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePreviewCommand", () => {
  it("deferReplyが失敗した場合はfollowUpを呼ばない", async () => {
    const interaction = makeInteraction({
      deferReply: vi.fn().mockRejectedValue(new Error("defer failed")),
    });

    await handlePreviewCommand(interaction as unknown as ChatInputCommandInteraction, {} as Client);

    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it("リンクを含まない場合はInvalid message linkを返す", async () => {
    const interaction = makeInteraction({
      options: { getString: vi.fn().mockReturnValue("not a discord link") },
    });

    await handlePreviewCommand(interaction as unknown as ChatInputCommandInteraction, {} as Client);

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: "Invalid message link.",
      ephemeral: true,
    });
  });

  it("メッセージが見つからない場合はMessage not foundを返す", async () => {
    vi.mocked(fetchTargetMessage).mockResolvedValueOnce(null);
    const interaction = makeInteraction();

    await handlePreviewCommand(interaction as unknown as ChatInputCommandInteraction, {} as Client);

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: "Message not found.",
      ephemeral: true,
    });
  });

  it("正常系ではbuildPreviewPayloadの結果でfollowUpする", async () => {
    vi.mocked(fetchTargetMessage).mockResolvedValueOnce({
      message: {} as never,
      channel: {} as never,
      guild: {} as never,
    });
    const fixedPayload = { embeds: [], files: [], components: [] };
    vi.mocked(buildPreviewPayload).mockResolvedValueOnce(fixedPayload as never);
    const interaction = makeInteraction();

    await handlePreviewCommand(interaction as unknown as ChatInputCommandInteraction, {} as Client);

    expect(interaction.followUp).toHaveBeenCalledWith(fixedPayload);
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
      body: [previewCommand.toJSON()],
    });
  });
});
