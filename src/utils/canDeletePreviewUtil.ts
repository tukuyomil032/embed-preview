import { ButtonInteraction, Client, PermissionFlagsBits } from "discord.js";
import { resolveOriginalUrlFromButtonInteraction } from "./buttons.ts";
import { extractMessageLinks } from "./urlParser.ts";
import { fetchTargetMessage } from "./fetcher.ts";

/**
 * Result of the determination on whether the message can be deleted
 */
export interface canDeletePreviewResult {
  canDeletePreview: boolean;
  canDeleteOriginal: boolean;
  reason?: string;
}

/**
 * Determine whether the user who pressed the button has permission to delete the preview (owner or manage messages permission)
 * @param interaction ButtonInteraction
 * @param client Client
 * @returns canDeletePreviewResult
 */
export async function canDeletePreviewFunc(
  interaction: ButtonInteraction,
  client: Client,
): Promise<canDeletePreviewResult> {
  const clickingUserId = interaction.user.id;

  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    // If the user who pressed the button has permission to manage the message
    return {
      canDeletePreview: true,
      canDeleteOriginal: true,
    };
  }

  let previewInvokerId: string | undefined;

  try {
    // Preview via mention
    // If invoked via a slash command, an exception occurs here
    const originalMsg = await interaction.message.fetchReference();
    previewInvokerId = originalMsg.author.id;
  } catch {
    // Preview via Slash Command
    previewInvokerId = interaction.message.interactionMetadata?.user.id;
  }

  if (clickingUserId === previewInvokerId) {
    return {
      canDeletePreview: true,
      canDeleteOriginal: true,
    };
  }

  try {
    const url = resolveOriginalUrlFromButtonInteraction(interaction);
    const links = extractMessageLinks(url);
    const [link] = links;
    if (link) {
      const targetResult = await fetchTargetMessage(
        client,
        link.guildId,
        link.channelId,
        link.messageId,
      );
      if (targetResult && targetResult.message.author.id === clickingUserId) {
        return {
          canDeletePreview: true,
          canDeleteOriginal: false,
        };
      }
    }
  } catch (e) {
    console.warn("[canDeletePreview] Failed to check target message author: ", e);
  }

  return {
    canDeletePreview: false,
    canDeleteOriginal: false,
    reason: "not_owner_invoker_or_mod",
  };
}
