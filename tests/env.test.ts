import { describe, expect, it, vi } from "vitest";
import { resolveDiscordToken } from "../src/utils/env.ts";

describe("resolveDiscordToken", () => {
  it("トークンが設定されていればそのまま返す", () => {
    const exit = vi.fn((): never => {
      throw new Error("exit called");
    });

    const token = resolveDiscordToken({ DISCORD_TOKEN: "abc123" }, exit);

    expect(token).toBe("abc123");
    expect(exit).not.toHaveBeenCalled();
  });

  it("トークンが未設定ならconsole.errorとexit(1)が呼ばれる", () => {
    const exit = vi.fn((): never => {
      throw new Error("exit called");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => resolveDiscordToken({}, exit)).toThrow("exit called");

    expect(errorSpy).toHaveBeenCalledWith("[index] DISCORD_TOKEN is not set in .env");
    expect(exit).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
  });
});
