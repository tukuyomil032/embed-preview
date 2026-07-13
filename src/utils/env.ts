export function resolveDiscordToken(env: NodeJS.ProcessEnv, exit: (code: number) => never): string {
  const token = env["DISCORD_TOKEN"];
  if (!token) {
    console.error("[index] DISCORD_TOKEN is not set in .env");
    exit(1);
  }
  return token as string;
}
