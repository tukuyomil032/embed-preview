import * as fs from "node:fs";
import * as path from "node:path";

export interface ListConfig {
  channels: string[];
  users: string[];
  roles: string[];
}

export interface GuildSettings {
  blacklist: ListConfig;
  whitelist: ListConfig;
}

export interface SettingsData {
  guilds: Record<string, GuildSettings>;
}

export function createDefaultGuildSettings(): GuildSettings {
  return {
    blacklist: {
      channels: [],
      users: [],
      roles: [],
    },
    whitelist: {
      channels: [],
      users: [],
      roles: [],
    },
  };
}

function cloneGuildSettings(settings: GuildSettings): GuildSettings {
  return {
    blacklist: {
      channels: [...(settings.blacklist?.channels || [])],
      users: [...(settings.blacklist?.users || [])],
      roles: [...(settings.blacklist?.roles || [])],
    },
    whitelist: {
      channels: [...(settings.whitelist?.channels || [])],
      users: [...(settings.whitelist?.users || [])],
      roles: [...(settings.whitelist?.roles || [])],
    },
  };
}

export class SettingsManager {
  private filepath: string;
  private cache: SettingsData;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filepath: string = "data/settings.json") {
    this.filepath = filepath;
    this.cache = { guilds: {} };
  }

  /**
   * Loads settings from the file.
   * If the file does not exist, initializes cache and writes an empty JSON file.
   */
  async load(): Promise<void> {
    try {
      try {
        await fs.promises.access(this.filepath);
      } catch {
        // File doesn't exist, initialize and write empty settings
        this.cache = { guilds: {} };
        await this.save();
        return;
      }

      const content = await fs.promises.readFile(this.filepath, "utf-8");
      if (!content.trim()) {
        this.cache = { guilds: {} };
        await this.save();
        return;
      }

      const parsed = JSON.parse(content);
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.guilds &&
        typeof parsed.guilds === "object"
      ) {
        this.cache = parsed;
      } else {
        this.cache = { guilds: {} };
      }
    } catch (err) {
      console.warn(
        `[SettingsManager] Error loading settings from ${this.filepath}, falling back to empty config:`,
        err,
      );
      this.cache = { guilds: {} };
    }
  }

  /**
   * Saves the current cache to the file in a queued, non-overlapping manner.
   */
  async save(): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        try {
          const dir = path.dirname(this.filepath);
          await fs.promises.mkdir(dir, { recursive: true });
          const data = JSON.stringify(this.cache, null, 2);
          await fs.promises.writeFile(this.filepath, data, "utf-8");
        } catch (err) {
          console.error(`[SettingsManager] Failed to save settings to ${this.filepath}:`, err);
          throw err;
        }
      });
    return this.writeQueue;
  }

  /**
   * Retrieves settings for a guild. If not exist, returns default settings.
   */
  getSettings(guildId: string): GuildSettings {
    const raw = this.cache.guilds[guildId];
    const settings = raw ? cloneGuildSettings(raw) : createDefaultGuildSettings();
    return settings;
  }

  /**
   * Sets settings for a guild and saves them to the file.
   */
  async setSettings(guildId: string, settings: GuildSettings): Promise<void> {
    this.cache.guilds[guildId] = cloneGuildSettings(settings);
    await this.save();
  }

  /**
   * Determines if message previewing is allowed under the current guild context.
   */
  isAllowed(guildId: string, channelId: string, userId: string, roleIds: string[]): boolean {
    const settings = this.getSettings(guildId);
    const { blacklist, whitelist } = settings;

    const whitelistChannels = whitelist.channels || [];
    const whitelistUsers = whitelist.users || [];
    const whitelistRoles = whitelist.roles || [];

    const hasWhitelist =
      whitelistChannels.length > 0 || whitelistUsers.length > 0 || whitelistRoles.length > 0;

    if (hasWhitelist) {
      const channelAllowed = whitelistChannels.includes(channelId);
      const userAllowed = whitelistUsers.includes(userId);
      const roleAllowed = roleIds.some((roleId) => whitelistRoles.includes(roleId));
      return channelAllowed || userAllowed || roleAllowed;
    } else {
      const blacklistChannels = blacklist.channels || [];
      const blacklistUsers = blacklist.users || [];
      const blacklistRoles = blacklist.roles || [];

      const channelBlocked = blacklistChannels.includes(channelId);
      const userBlocked = blacklistUsers.includes(userId);
      const roleBlocked = roleIds.some((roleId) => blacklistRoles.includes(roleId));
      return !(channelBlocked || userBlocked || roleBlocked);
    }
  }
}

// Export a default singleton instance for convenience
export const settingsManager = new SettingsManager();
