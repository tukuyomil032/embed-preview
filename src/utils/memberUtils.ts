import { GuildMember, type APIInteractionGuildMember } from "discord.js";

/**
 * Extracts all role IDs from a member, ensuring the @everyone role ID (guildId) is always included.
 *
 * @param member GuildMember, APIInteractionGuildMember, or generic member object
 * @param guildId ID of the guild (which also serves as the @everyone role ID)
 * @returns Array of role IDs including the @everyone role ID
 */
export function extractMemberRoleIds(
  member: GuildMember | APIInteractionGuildMember | any | null | undefined,
  guildId: string,
): string[] {
  const roleIds: string[] = [];

  if (member && typeof member === "object") {
    const roles = member.roles;
    if (Array.isArray(roles)) {
      roleIds.push(...roles);
    } else if (roles && typeof roles === "object" && roles.cache) {
      if (typeof roles.cache.keys === "function") {
        roleIds.push(...roles.cache.keys());
      } else if (Array.isArray(roles.cache)) {
        roleIds.push(...roles.cache);
      }
    }
  }

  if (!roleIds.includes(guildId)) {
    roleIds.push(guildId);
  }

  return roleIds;
}
