import { GuildMember, type APIInteractionGuildMember } from "discord.js";
import { describe, expect, it } from "vitest";
import { extractMemberRoleIds } from "../src/utils/memberUtils.ts";

describe("extractMemberRoleIds", () => {
  const guildId = "guild_123";

  it("returns [guildId] when member is null or undefined", () => {
    expect(extractMemberRoleIds(null, guildId)).toEqual(["guild_123"]);
    expect(extractMemberRoleIds(undefined, guildId)).toEqual(["guild_123"]);
  });

  it("extracts roles from APIInteractionGuildMember and includes guildId (@everyone)", () => {
    const apiMember: APIInteractionGuildMember = {
      roles: ["role_1", "role_2"],
      joined_at: "2026-01-01T00:00:00.000Z",
      deaf: false,
      mute: false,
      flags: 0,
    };

    const roleIds = extractMemberRoleIds(apiMember, guildId);
    expect(roleIds).toContain("role_1");
    expect(roleIds).toContain("role_2");
    expect(roleIds).toContain("guild_123");
  });

  it("does not duplicate guildId if APIInteractionGuildMember already contains guildId", () => {
    const apiMember: APIInteractionGuildMember = {
      roles: ["role_1", "guild_123"],
      joined_at: "2026-01-01T00:00:00.000Z",
      deaf: false,
      mute: false,
      flags: 0,
    };

    const roleIds = extractMemberRoleIds(apiMember, guildId);
    expect(roleIds.filter((id) => id === "guild_123")).toHaveLength(1);
  });

  it("extracts roles from GuildMember instance and includes guildId (@everyone)", () => {
    const cache = new Map<string, any>([
      ["role_a", { id: "role_a" }],
      ["guild_123", { id: "guild_123" }],
    ]);

    const guildMember = Object.create(GuildMember.prototype);
    Object.defineProperty(guildMember, "roles", {
      value: { cache },
    });

    const roleIds = extractMemberRoleIds(guildMember, guildId);
    expect(roleIds).toContain("role_a");
    expect(roleIds).toContain("guild_123");
  });

  it("adds guildId if GuildMember cache does not contain it", () => {
    const cache = new Map<string, any>([["role_a", { id: "role_a" }]]);

    const guildMember = Object.create(GuildMember.prototype);
    Object.defineProperty(guildMember, "roles", {
      value: { cache },
    });

    const roleIds = extractMemberRoleIds(guildMember, guildId);
    expect(roleIds).toContain("role_a");
    expect(roleIds).toContain("guild_123");
  });

  it("extracts roles from mock object with roles.cache Map", () => {
    const cache = new Map<string, any>([["role_mock", { id: "role_mock" }]]);
    const mockMember = { roles: { cache } };

    const roleIds = extractMemberRoleIds(mockMember, guildId);
    expect(roleIds).toContain("role_mock");
    expect(roleIds).toContain("guild_123");
  });
});
