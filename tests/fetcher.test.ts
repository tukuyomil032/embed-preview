import type { Client, Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { fetchTargetMessage } from "../src/utils/fetcher.ts";

function makeGuild(
  overrides: {
    channelsCacheGet?: () => unknown;
    fetchActiveThreads?: () => Promise<{ threads: Map<string, unknown> }>;
  } = {},
) {
  return {
    channels: {
      cache: { get: vi.fn(overrides.channelsCacheGet ?? (() => undefined)) },
      fetchActiveThreads: vi.fn(
        overrides.fetchActiveThreads ?? (() => Promise.resolve({ threads: new Map() })),
      ),
    },
  };
}

function makeClient(guild: unknown, channelsFetch: ReturnType<typeof vi.fn> = vi.fn()) {
  return {
    guilds: { cache: { get: vi.fn(() => guild) } },
    channels: { fetch: channelsFetch },
  } as unknown as Client;
}

function makeChannel(messageFetch: ReturnType<typeof vi.fn>) {
  return { messages: { fetch: messageFetch } };
}

function makeThread(messageFetch: ReturnType<typeof vi.fn>) {
  return { messages: { fetch: messageFetch } };
}

const FAKE_MESSAGE = { id: "msg-1" } as unknown as Message;

describe("fetchTargetMessage", () => {
  it("guildが見つからない場合はnullを返す", async () => {
    const client = makeClient(undefined);

    const result = await fetchTargetMessage(client, "g1", "c1", "m1");

    expect(result).toBeNull();
  });

  it("channelがcacheにもfetchでも見つからない場合はnullを返す", async () => {
    const guild = makeGuild();
    const channelsFetch = vi.fn().mockResolvedValue(null);
    const client = makeClient(guild, channelsFetch);

    const result = await fetchTargetMessage(client, "g1", "c1", "m1");

    expect(result).toBeNull();
  });

  it("client.channels.fetchが例外をthrowした場合はnullを返す", async () => {
    const guild = makeGuild();
    const channelsFetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const client = makeClient(guild, channelsFetch);

    const result = await fetchTargetMessage(client, "g1", "c1", "m1");

    expect(result).toBeNull();
  });

  it("取得したchannelにmessagesプロパティが無い場合はnullを返す", async () => {
    const guild = makeGuild({ channelsCacheGet: () => ({ type: "category" }) });
    const client = makeClient(guild);

    const result = await fetchTargetMessage(client, "g1", "c1", "m1");

    expect(result).toBeNull();
  });

  it("通常チャンネルでメッセージ取得に成功した場合はそのまま返す", async () => {
    const messageFetch = vi.fn().mockResolvedValue(FAKE_MESSAGE);
    const channel = makeChannel(messageFetch);
    const guild = makeGuild({ channelsCacheGet: () => channel });
    const client = makeClient(guild);

    const result = await fetchTargetMessage(client, "g1", "c1", "m1");

    expect(result).toEqual({ message: FAKE_MESSAGE, channel, guild });
    expect(guild.channels.fetchActiveThreads).not.toHaveBeenCalled();
  });

  it("通常チャンネルで見つからない場合はアクティブスレッドを検索する", async () => {
    const messageFetch = vi.fn().mockRejectedValue(new Error("not found"));
    const channel = makeChannel(messageFetch);
    const threadMessageFetch = vi.fn().mockResolvedValue(FAKE_MESSAGE);
    const thread = makeThread(threadMessageFetch);
    const guild = makeGuild({
      channelsCacheGet: () => channel,
      fetchActiveThreads: () => Promise.resolve({ threads: new Map([["t1", thread]]) }),
    });
    const client = makeClient(guild);

    const result = await fetchTargetMessage(client, "g1", "c1", "m1");

    expect(result).toEqual({ message: FAKE_MESSAGE, channel: thread, guild });
  });

  it("複数スレッド中、最初が失敗し2番目で成功した場合は2番目を返す", async () => {
    const messageFetch = vi.fn().mockRejectedValue(new Error("not found"));
    const channel = makeChannel(messageFetch);
    const failingThreadFetch = vi.fn().mockRejectedValue(new Error("not in thread"));
    const failingThread = makeThread(failingThreadFetch);
    const succeedingThreadFetch = vi.fn().mockResolvedValue(FAKE_MESSAGE);
    const succeedingThread = makeThread(succeedingThreadFetch);
    const guild = makeGuild({
      channelsCacheGet: () => channel,
      fetchActiveThreads: () =>
        Promise.resolve({
          threads: new Map([
            ["t1", failingThread],
            ["t2", succeedingThread],
          ]),
        }),
    });
    const client = makeClient(guild);

    const result = await fetchTargetMessage(client, "g1", "c1", "m1");

    expect(result).toEqual({ message: FAKE_MESSAGE, channel: succeedingThread, guild });
    expect(succeedingThreadFetch).toHaveBeenCalled();
  });

  it("全スレッドで失敗した場合はnullを返す", async () => {
    const messageFetch = vi.fn().mockRejectedValue(new Error("not found"));
    const channel = makeChannel(messageFetch);
    const threadFetch = vi.fn().mockRejectedValue(new Error("not in thread"));
    const thread = makeThread(threadFetch);
    const guild = makeGuild({
      channelsCacheGet: () => channel,
      fetchActiveThreads: () => Promise.resolve({ threads: new Map([["t1", thread]]) }),
    });
    const client = makeClient(guild);

    const result = await fetchTargetMessage(client, "g1", "c1", "m1");

    expect(result).toBeNull();
  });

  it("fetchActiveThreads自体が例外をthrowした場合はnullを返す", async () => {
    const messageFetch = vi.fn().mockRejectedValue(new Error("not found"));
    const channel = makeChannel(messageFetch);
    const guild = makeGuild({
      channelsCacheGet: () => channel,
      fetchActiveThreads: () => Promise.reject(new Error("threads unavailable")),
    });
    const client = makeClient(guild);

    const result = await fetchTargetMessage(client, "g1", "c1", "m1");

    expect(result).toBeNull();
  });
});
