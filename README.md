# pi-retry

> Retry an active response or resume a stopped response with a shortcut (default `Ctrl+Alt+R`).

A Pi extension for:

- aborting a slow active response and starting a fresh provider request for the same assistant turn, or
- resuming from an accidentally/intentionally stopped assistant response without typing `continue`.

## Why?

This extension may help in scenarios where a provider may have multiple upstream providers, and one of them is slow. By "retrying" the request, you request will be re-sent, and will hopefully be sent to a faster provider during the retry.

## Shortcuts

- `Ctrl+Alt+R`: Retry the in-progress response, or resume a stopped response when idle

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
2. If Pi is idle, the shortcut can resume only when all of the following are true:
   - no pending queued messages
   - editor input is empty
   - the latest leaf message is an assistant message with `stopReason: "aborted"`
3. For both retry and resume trigger turns, provider context strips:
   - the hidden trigger message
   - the targeted aborted assistant message
4. This means the model sees the last clean context (without the partial aborted output).
5. Aborted partial output may still remain visible in session history/UI; it is only stripped from provider context for retry/resume.

## Notes

- Shortcut conflicts may still occur depending on other installed extensions and active keymaps.
