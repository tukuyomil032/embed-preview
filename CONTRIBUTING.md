# Contributing to embed-preview

Thanks for your interest in improving embed-preview! This document explains how to get set up, the conventions this project follows, and how to submit a good pull request.

## Ways to contribute

- **Bug reports** — open an issue with steps to reproduce.
- **Feature requests** — open an issue describing the use case before writing code.
- **Pull requests** — code fixes, new features, tests, or documentation improvements.

## Before you start

- Check open issues and pull requests to avoid duplicate work.
- For anything beyond a small fix (new commands, behavior changes, dependency additions), open an issue first to discuss the approach before investing time in an implementation.

## Development setup

1. Install dependencies:
   ```bash
   bun install
   ```
   This also installs the [Lefthook](https://github.com/evilmartians/lefthook) git hooks used for pre-commit checks.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` to your bot's token.
3. In the [Discord Developer Portal](https://discord.com/developers/applications), enable the **Message Content Intent** for your application (see `README.md` for the full setup walkthrough, including OAuth2 scopes and invite permissions).
4. Start the bot in watch mode:
   ```bash
   just dev
   ```

## Project conventions

### Branch naming

Use `<type>/<kebab-case-description>`, matching this repository's history:

- `feat/` — new features
- `fix/` — bug fixes
- `test/` — test-only changes
- `docs/` — documentation-only changes
- `ref/` — refactors
- `npm/` — dependency updates

### Commit messages

Prefix commits with one of: `feat:`, `fix:`, `ref:` (short for refactor), `docs:`, `chore:`, `chore(deps):`. Write the summary in the imperative mood.

```
fix: prevent duplicate replies on message edits
ref: extract token/button-url resolution for testability
```

### Contribution workflow

1. Create a branch off `main`.
2. Implement the change.
3. Add or update tests for the change (see [Coding guidelines](#coding-guidelines)).
4. Commit — prefer one commit per logical task rather than a single large commit.
5. Open a pull request against `main`.

## Coding guidelines

- TypeScript runs in `strict` mode with additional flags enabled (`noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`) — write code that satisfies these without `any`-casting around them.
- Formatting and linting are enforced by `oxfmt`/`oxlint`; don't hand-format code or debate style in review, just run `just fmt-fix` / `just lint-fix`.
- Follow these Discord bot–specific rules (see also `CLAUDE.md`):
  - Always `return` early when handling the bot's own messages (`message.author.bot`) to avoid infinite reply loops.
  - In `messageCreate`, always verify the bot mention is at the start of the message before treating it as a command — don't react to a bare URL alone.
  - Never swallow errors in a `catch` block silently; always log with `console.warn`/`console.error`.
  - When fetching a message by ID, fall back to searching `channel.threads.active` if the initial `messages.fetch` fails — messages inside threads won't resolve otherwise.

## Validation

Before opening a pull request, run the full check suite locally — it mirrors what CI runs:

```bash
just check
```

This runs `fmt:check` → `lint:check` → `typecheck` → `test`, in that order. Test case descriptions in `tests/*.test.ts` are written in Japanese, following the existing convention in this repository — new tests should follow suit.

## Pull request description format

The PR template asks for four sections — fill them in rather than deleting them:

- **Problem** — what's broken, missing, or awkward today, and why it matters. Describe the current behavior, not the fix.
- **Solution** — what you changed and why you took this approach, as a short bullet list.
- **Scope** — what's included, and just as importantly, what's explicitly _not_ touched by this change.
- **Validation** — the `just check` result plus any manual QA steps you performed against a real bot/server.

This mirrors how a good bug report separates "what's wrong" from "how it's fixed," and makes it much faster for a reviewer to judge whether the change matches the stated problem.

## Pull request checklist

- [ ] `just fmt` passes
- [ ] `just lint` passes
- [ ] `just typecheck` passes
- [ ] `just test` passes
- [ ] Tests were added or updated for the change
- [ ] The PR description follows the Problem / Solution / Scope / Validation format and links any related issue

## Reporting bugs

Include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment info (Bun version, OS)

## Security issues

If you find a vulnerability that could expose secrets (e.g. `DISCORD_TOKEN` handling) or otherwise affect users' security, please do not open a public issue. Report it privately to the maintainer instead.
