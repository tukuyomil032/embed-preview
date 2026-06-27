export type MessageLink = {
  guildId: string;
  channelId: string;
  messageId: string;
};

const MESSAGE_LINK_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com|canary\.discord\.com|ptb\.discord\.com)\/channels\/(\d+)\/(\d+)\/(\d+)/g;

export function extractMessageLinks(content: string): MessageLink[] {
  const links: MessageLink[] = [];
  let match: RegExpExecArray | null;
  MESSAGE_LINK_PATTERN.lastIndex = 0;
  while ((match = MESSAGE_LINK_PATTERN.exec(content)) !== null) {
    const [, guildId, channelId, messageId] = match;
    if (guildId && channelId && messageId) {
      links.push({ guildId, channelId, messageId });
    }
  }
  return links;
}
