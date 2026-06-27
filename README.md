# embed-preview

[![CI](https://github.com/tukuyomil032/embed-preview/workflows/CI/badge.svg)](https://github.com/tukuyomil032/embed-preview/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A Discord bot that generates rich embed previews when a Discord message link is shared. Mention the bot with a link, and it replies with the message content, author info, images, and action buttons — no context switching needed.

## Features

- **Message preview on mention** — `@bot <discord-message-url>` replies with a formatted embed
- **`/preview` slash command** — works without a mention
- **Image grid** — up to 4 images composed into a 2×2 grid via [sharp](https://sharp.pixelplumbing.com/)
- **Video links** — video attachments shown as a clickable field
- **Reactions & attachments** — displayed inline in the embed
- **Thread support** — fetches messages from active threads with automatic fallback
- **Action buttons** — "Open original message" and "Direct link"

## Tech stack

| Layer | Tool |
|---|---|
| Runtime | [Bun](https://bun.sh/) |
| Language | TypeScript (strict) |
| Discord API | [Discord.js v14](https://discord.js.org/) |
| Image processing | [sharp](https://sharp.pixelplumbing.com/) |
| Testing | [Vitest](https://vitest.dev/) |
| Lint / Format | [oxlint](https://oxc.rs/docs/guide/usage/linter.html) / [oxfmt](https://github.com/nicolo-ribaudo/oxfmt) |
| Git hooks | [Lefthook](https://github.com/evilmartians/lefthook) |
| Task runner | [Just](https://github.com/casey/just) |

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) ≥ 1.0
- [Just](https://github.com/casey/just) (optional but recommended)
- A Discord application with a bot token ([Developer Portal](https://discord.com/developers/applications))

### Setup

```bash
# Install dependencies
bun install

# Copy env file and fill in your token
cp .env.example .env
```

Edit `.env`:

```
DISCORD_TOKEN=your_bot_token_here
```

### Discord Developer Portal settings

In your application's **Bot** settings:

- Enable **Message Content Intent**
- Disable **Require OAuth2 Code Grant**

When inviting the bot, use an OAuth2 URL with scopes `bot` + `applications.commands` and at minimum these permissions: **Send Messages**, **Embed Links**, **Attach Files**, **Read Message History**.

### Running

```bash
just dev      # development (watch mode)
just start    # production
```

Or without Just:

```bash
bun --watch src/index.ts   # development
bun src/index.ts           # production
```

## Usage

**Via mention:**

```
@embed-preview https://discord.com/channels/123/456/789
```

**Via slash command:**

```
/preview link:https://discord.com/channels/123/456/789
```

The bot replies with a rich embed containing the message content, author, timestamp, reactions, attachments, and any images or videos — plus buttons to open the original message.

> [!NOTE]
> The bot only responds to messages where the mention appears at the very start. This prevents accidental triggers when the bot is mentioned later in a message.

## Project structure

```
src/
├── index.ts                 # Entry point — bot login, event/command wiring
├── events/
│   └── messageCreate.ts     # Mention guard → URL detection → preview reply
├── commands/
│   └── preview.ts           # /preview slash command
└── utils/
    ├── urlParser.ts         # Discord message URL extraction (regex)
    ├── fetcher.ts           # Message fetch with active thread fallback
    ├── embedBuilder.ts      # EmbedBuilder — author, footer, reactions, attachments
    ├── imageGrid.ts         # sharp 2×2 grid composition (320 px tiles, 640×640 canvas)
    ├── buttons.ts           # Action row buttons
    └── previewCore.ts       # Orchestrates fetch → embed → grid → reply
tests/
├── urlParser.test.ts
├── embedBuilder.test.ts
└── imageGrid.test.ts
```

## Development

```bash
just test       # run tests
just lint       # lint check
just fmt        # format check
just typecheck  # TypeScript type check
just check      # fmt + lint (full pre-commit check)
```

Pre-commit hooks (via Lefthook) run `fmt:check`, `lint:check`, and `vitest` automatically on staged files.

### Supported URL formats

The bot detects Discord message links from all official clients:

- `discord.com/channels/<guild>/<channel>/<message>`
- `discordapp.com/channels/…`
- `canary.discord.com/channels/…`
- `ptb.discord.com/channels/…`
