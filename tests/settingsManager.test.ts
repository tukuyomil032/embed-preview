import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { SettingsManager, createDefaultGuildSettings } from "../src/utils/settingsManager.ts";

const TEST_FILE = path.resolve("tests/temp-settings.json");

describe("SettingsManager", () => {
  let manager: SettingsManager;

  beforeEach(() => {
    manager = new SettingsManager(TEST_FILE);
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(TEST_FILE)) {
        await fs.promises.unlink(TEST_FILE);
      }
    } catch {
      // ignore
    }
  });

  describe("ファイル I/O とキャッシュ", () => {
    it("ファイルが存在しない場合は空設定で初期化し保存する", async () => {
      expect(fs.existsSync(TEST_FILE)).toBe(false);
      await manager.load();
      expect(fs.existsSync(TEST_FILE)).toBe(true);

      const content = await fs.promises.readFile(TEST_FILE, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual({ guilds: {} });
    });

    it("既存のファイルから設定をロードする", async () => {
      const initialData = {
        guilds: {
          "111222333": {
            mode: "blacklist",
            blacklist: {
              channels: ["c1"],
              users: ["u1"],
              roles: ["r1"],
            },
            whitelist: {
              channels: [],
              users: [],
              roles: [],
            },
          },
        },
      };
      await fs.promises.mkdir(path.dirname(TEST_FILE), { recursive: true });
      await fs.promises.writeFile(TEST_FILE, JSON.stringify(initialData, null, 2), "utf-8");

      await manager.load();
      const settings = manager.getSettings("111222333");
      expect(settings.mode).toBe("blacklist");
      expect(settings.blacklist.channels).toEqual(["c1"]);
      expect(settings.blacklist.users).toEqual(["u1"]);
      expect(settings.blacklist.roles).toEqual(["r1"]);
    });

    it("設定を更新し、キャッシュおよびファイルに保存する", async () => {
      await manager.load();
      const newSettings = createDefaultGuildSettings();
      newSettings.mode = "whitelist";
      newSettings.whitelist.channels.push("c_white");

      await manager.setSettings("guild_abc", newSettings);

      // Verify cache
      const cached = manager.getSettings("guild_abc");
      expect(cached.mode).toBe("whitelist");
      expect(cached.whitelist.channels).toEqual(["c_white"]);

      // Verify file
      const fileContent = await fs.promises.readFile(TEST_FILE, "utf-8");
      const parsed = JSON.parse(fileContent);
      expect(parsed.guilds["guild_abc"].mode).toBe("whitelist");
      expect(parsed.guilds["guild_abc"].whitelist.channels).toEqual(["c_white"]);
    });
  });

  describe("isAllowed 判定ロジック", () => {
    describe("ブラックリストモードの場合", () => {
      beforeEach(async () => {
        await manager.load();
        const settings = createDefaultGuildSettings();
        settings.mode = "blacklist";
        settings.blacklist.channels.push("blocked_chan");
        settings.blacklist.users.push("blocked_user");
        settings.blacklist.roles.push("blocked_role");
        await manager.setSettings("g1", settings);
      });

      it("対象がブラックリストに含まれていなければ許可する", () => {
        const allowed = manager.isAllowed("g1", "safe_chan", "safe_user", ["role1", "role2"]);
        expect(allowed).toBe(true);
      });

      it("チャンネルがブラックリストに含まれている場合は拒否する", () => {
        const allowed = manager.isAllowed("g1", "blocked_chan", "safe_user", ["role1", "role2"]);
        expect(allowed).toBe(false);
      });

      it("ユーザーがブラックリストに含まれている場合は拒否する", () => {
        const allowed = manager.isAllowed("g1", "safe_chan", "blocked_user", ["role1", "role2"]);
        expect(allowed).toBe(false);
      });

      it("ロールがブラックリストに含まれている場合は拒否する", () => {
        const allowed = manager.isAllowed("g1", "safe_chan", "safe_user", [
          "role1",
          "blocked_role",
        ]);
        expect(allowed).toBe(false);
      });
    });

    describe("ホワイトリストモードの場合", () => {
      beforeEach(async () => {
        await manager.load();
        const settings = createDefaultGuildSettings();
        settings.mode = "whitelist";
        settings.whitelist.channels.push("ok_chan");
        settings.whitelist.users.push("ok_user");
        settings.whitelist.roles.push("ok_role");

        await manager.setSettings("g1", settings);
      });

      it("チャンネルがホワイトリストに含まれている場合は許可する", () => {
        const allowed = manager.isAllowed("g1", "ok_chan", "other_user", ["other_role"]);
        expect(allowed).toBe(true);
      });

      it("ユーザーがホワイトリストに含まれている場合は許可する", () => {
        const allowed = manager.isAllowed("g1", "other_chan", "ok_user", ["other_role"]);
        expect(allowed).toBe(true);
      });

      it("ロールがホワイトリストに含まれている場合は許可する", () => {
        const allowed = manager.isAllowed("g1", "other_chan", "other_user", [
          "ok_role",
          "other_role",
        ]);
        expect(allowed).toBe(true);
      });

      it("ホワイトリストのいずれにもマッチしない場合は拒否する", () => {
        const allowed = manager.isAllowed("g1", "safe_chan", "safe_user", ["safe_role"]);
        expect(allowed).toBe(false);
      });
    });
  });
});
