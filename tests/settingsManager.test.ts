import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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
    } catch (err) {
      console.warn(`[test] Failed to clean up ${TEST_FILE}:`, err);
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
      expect(manager.getIsLoaded()).toBe(true);
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

    it("JSON破損など読み込み失敗時は getIsLoaded() が false となり isAllowed が false を返す (Fail-Closed)", async () => {
      await fs.promises.mkdir(path.dirname(TEST_FILE), { recursive: true });
      await fs.promises.writeFile(TEST_FILE, "invalid json content", "utf-8");

      await manager.load();
      expect(manager.getIsLoaded()).toBe(false);
      expect(manager.isAllowed("g1", "c1", "u1", [])).toBe(false);
    });

    it("並行して setSettings と load を実行してもデータの一貫性が維持される", async () => {
      await manager.load();
      const settings1 = createDefaultGuildSettings();
      settings1.mode = "whitelist";

      // Trigger setSettings (which queues a save) and load concurrently
      const p1 = manager.setSettings("g_race", settings1);
      const p2 = manager.load();

      await Promise.all([p1, p2]);

      const result = manager.getSettings("g_race");
      expect(result.mode).toBe("whitelist");
    });

    it("既存の設定を読み込んだ後に破損したJSONを再読み込みしても既存のキャッシュは破棄されない", async () => {
      await manager.load();
      const goodSettings = createDefaultGuildSettings();
      goodSettings.blacklist.users.push("preserved_user");
      await manager.setSettings("g1", goodSettings);

      await fs.promises.writeFile(TEST_FILE, "{ this is not valid json", "utf-8");
      await manager.load();

      expect(manager.getIsLoaded()).toBe(false);
      // isAllowed fails closed regardless, but the underlying cache itself must
      // survive so a subsequent successful load doesn't lose the data either.
      expect((manager as any).cache.guilds.g1.blacklist.users).toContain("preserved_user");
    });

    it("writeQueue により複数の setSettings が直列化され、最終的なファイルは全guildを含む有効なJSONになる", async () => {
      await manager.load();

      const guildIds = Array.from({ length: 10 }, (_, i) => `g_concurrent_${i}`);
      await Promise.all(
        guildIds.map((id) => {
          const settings = createDefaultGuildSettings();
          settings.blacklist.channels.push(id);
          return manager.setSettings(id, settings);
        }),
      );

      const content = await fs.promises.readFile(TEST_FILE, "utf-8");
      const parsed = JSON.parse(content);
      for (const id of guildIds) {
        expect(parsed.guilds[id]?.blacklist.channels).toContain(id);
      }
    });
  });

  describe("未登録ギルドの扱い", () => {
    it("未登録のギルドIDにはデフォルト設定を返し、変更してもキャッシュに影響しない", async () => {
      await manager.load();

      const settings = manager.getSettings("never_seen_guild");
      expect(settings.mode).toBe("blacklist");
      expect(settings.blacklist.channels).toEqual([]);

      settings.blacklist.channels.push("mutated_after_return");
      const settingsAgain = manager.getSettings("never_seen_guild");
      expect(settingsAgain.blacklist.channels).toEqual([]);
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

      it("ホワイトリストに一致してもブラックリストにも登録されている場合は拒否する(deny-wins)", async () => {
        const settings = manager.getSettings("g1");
        settings.blacklist.users.push("ok_user");
        await manager.setSettings("g1", settings);

        const allowed = manager.isAllowed("g1", "other_chan", "ok_user", ["other_role"]);
        expect(allowed).toBe(false);
      });
    });
  });
});

describe("SettingsManager デフォルトパスの解決", () => {
  const originalEnvPath = process.env.SETTINGS_PATH;
  const originalCwd = process.cwd();

  afterEach(() => {
    if (originalEnvPath === undefined) {
      delete process.env.SETTINGS_PATH;
    } else {
      process.env.SETTINGS_PATH = originalEnvPath;
    }
    process.chdir(originalCwd);
  });

  it("SETTINGS_PATH が設定されている場合はそれを使う", () => {
    process.env.SETTINGS_PATH = "/tmp/embed-preview-custom-settings.json";
    const manager = new SettingsManager();
    expect((manager as any).filepath).toBe("/tmp/embed-preview-custom-settings.json");
  });

  it("SETTINGS_PATH 未設定時はプロジェクトルート基準で解決し、process.cwd() に依存しない", () => {
    delete process.env.SETTINGS_PATH;
    process.chdir(os.tmpdir());

    const manager = new SettingsManager();

    expect((manager as any).filepath).toBe(path.resolve(originalCwd, "data/settings.json"));
  });
});
