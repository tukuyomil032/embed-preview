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

  describe("File I/O and Cache", () => {
    it("should initialize with empty settings and save if file does not exist", async () => {
      expect(fs.existsSync(TEST_FILE)).toBe(false);
      await manager.load();
      expect(fs.existsSync(TEST_FILE)).toBe(true);

      const content = await fs.promises.readFile(TEST_FILE, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual({ guilds: {} });
    });

    it("should load settings from existing file", async () => {
      const initialData = {
        guilds: {
          "111222333": {
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
      expect(settings.blacklist.channels).toEqual(["c1"]);
      expect(settings.blacklist.users).toEqual(["u1"]);
      expect(settings.blacklist.roles).toEqual(["r1"]);
    });

    it("should update settings, cache them, and save to file", async () => {
      await manager.load();
      const newSettings = createDefaultGuildSettings();
      newSettings.whitelist.channels.push("c_white");

      await manager.setSettings("guild_abc", newSettings);

      // Verify cache
      const cached = manager.getSettings("guild_abc");
      expect(cached.whitelist.channels).toEqual(["c_white"]);

      // Verify file
      const fileContent = await fs.promises.readFile(TEST_FILE, "utf-8");
      const parsed = JSON.parse(fileContent);
      expect(parsed.guilds["guild_abc"].whitelist.channels).toEqual(["c_white"]);
    });
  });

  describe("isAllowed logic", () => {
    describe("when whitelist is empty", () => {
      beforeEach(async () => {
        await manager.load();
        const settings = createDefaultGuildSettings();
        settings.blacklist.channels.push("blocked_chan");
        settings.blacklist.users.push("blocked_user");
        settings.blacklist.roles.push("blocked_role");
        await manager.setSettings("g1", settings);
      });

      it("should allow if nothing is blacklisted", () => {
        const allowed = manager.isAllowed("g1", "safe_chan", "safe_user", ["role1", "role2"]);
        expect(allowed).toBe(true);
      });

      it("should deny if channel is blacklisted", () => {
        const allowed = manager.isAllowed("g1", "blocked_chan", "safe_user", ["role1", "role2"]);
        expect(allowed).toBe(false);
      });

      it("should deny if user is blacklisted", () => {
        const allowed = manager.isAllowed("g1", "safe_chan", "blocked_user", ["role1", "role2"]);
        expect(allowed).toBe(false);
      });

      it("should deny if any user role is blacklisted", () => {
        const allowed = manager.isAllowed("g1", "safe_chan", "safe_user", [
          "role1",
          "blocked_role",
        ]);
        expect(allowed).toBe(false);
      });
    });

    describe("when whitelist is not empty", () => {
      beforeEach(async () => {
        await manager.load();
        const settings = createDefaultGuildSettings();
        settings.whitelist.channels.push("ok_chan");
        settings.whitelist.users.push("ok_user");
        settings.whitelist.roles.push("ok_role");

        // Also add blacklists to verify they are ignored when whitelist is active
        settings.blacklist.channels.push("blocked_chan");
        settings.blacklist.users.push("blocked_user");
        settings.blacklist.roles.push("blocked_role");

        await manager.setSettings("g1", settings);
      });

      it("should allow if channel is whitelisted", () => {
        // Even if user/role matches blacklist, whitelist should override/blacklist is ignored
        const allowed = manager.isAllowed("g1", "ok_chan", "blocked_user", ["blocked_role"]);
        expect(allowed).toBe(true);
      });

      it("should allow if user is whitelisted", () => {
        const allowed = manager.isAllowed("g1", "blocked_chan", "ok_user", ["blocked_role"]);
        expect(allowed).toBe(true);
      });

      it("should allow if role is whitelisted - actual test", () => {
        const allowed = manager.isAllowed("g1", "blocked_chan", "blocked_user", [
          "ok_role",
          "blocked_role",
        ]);
        expect(allowed).toBe(true);
      });

      it("should deny if nothing matches the whitelist", () => {
        const allowed = manager.isAllowed("g1", "safe_chan", "safe_user", ["safe_role"]);
        expect(allowed).toBe(false);
      });
    });
  });
});
