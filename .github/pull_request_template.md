## Problem

<!--
What's broken, missing, or awkward today? Describe the current behavior and
why it's a problem — not the fix yet.

Example:
Message links posted in a thread are not detected because messageCreate only
checks the mention prefix against the channel the message was posted in, not
the parent channel of the thread.
-->

## Solution

<!--
What did you change, and why this approach? A short bullet list of the key
changes is usually clearer than prose.

Example:
- Fall back to `channel.parent` when resolving the mention prefix inside a thread
- Add a `resolveMentionChannel()` helper in src/utils/ to share the logic
  between messageCreate and the /preview command
-->

## Scope

<!--
What's included, and what's explicitly NOT touched by this change? Calling
out non-goals helps reviewers know what NOT to expect from this PR.

Example:
- Only affects thread message detection; forum posts are out of scope
- Does not change the image grid composition logic
-->

## Validation

Completed:

- [ ] `just check` passed (fmt + lint + typecheck + test)
- [ ] Manually tested the change against a real Discord server/bot

<!--
List any manual QA steps you performed, e.g.:
- [ ] Posted a message link inside a thread and confirmed the bot replied with a preview
- [ ] Confirmed behavior is unchanged for message links posted in a regular channel
-->

## Related issue

Closes #

## Notes

<!-- Optional: edge cases, follow-up work, or anything else reviewers should know. -->
