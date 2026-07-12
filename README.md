# pi-retry

> Re-prompt or nudge the current turn with a shortcut (default `Ctrl+Alt+R`).

A Pi extension for:

- aborting a slow active response and starting a fresh provider request for the same assistant turn,
- resuming from an accidentally/intentionally stopped assistant response without typing `continue`, or
- nudging a new assistant turn from the current context when idle, without typing anything into the editor.

## Why?

A provider may route through multiple upstream providers, and one of them may be slow. By "retrying" the request, the request is re-sent and will hopefully be routed to a faster provider during the retry.

The same shortcut also works while idle: it kicks off a new assistant turn from whatever context is currently there. This is handy for prompting a continuation or follow-up turn without typing an explicit prompt.

## Shortcuts

- `Ctrl+Alt+R`: Retry the in-progress response, or start a new assistant turn from the current context when idle

## Installation

### From local clone

```bash
pi install /path/to/pi-retry
```

### From GitHub

```bash
pi install git:github.com/arcanemachine/pi-retry
```

## Configuration

Configure the shortcut in Pi settings (`.pi/settings.json` in a project or
`~/.pi/agent/settings.json` globally):

```json
{
  "pi-retry": {
    "shortcut": "ctrl+alt+r"
  }
}
```

Project settings override global settings.

## Behavior

1. If Pi is streaming, the shortcut aborts the current assistant response and starts a hidden trigger turn.
2. If Pi is idle, the shortcut sends a hidden trigger turn when all of the following are true:
   - no pending queued messages
   - editor input is empty
3. When an assistant response is aborted (either during retry, or when the leaf was already an aborted assistant message), that aborted message is stripped from provider context for the trigger turn. When there is no aborted assistant message in scope, the trigger turn is sent with the current context unchanged.
4. In all cases the hidden trigger message itself is also stripped from provider context.
5. Aborted partial output may still remain visible in session history/UI; it is only stripped from provider context for the trigger turn.

## Notes

- Shortcut conflicts may still occur depending on other installed extensions and active keymaps.
