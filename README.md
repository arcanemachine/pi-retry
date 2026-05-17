# pi-retry-response

> Retry the in-progress assistant response with a shortcut (default `Ctrl+Alt+R`).

A Pi extension for aborting a slow active response and immediately starting a fresh provider request for the same assistant turn.

Retry is intended for retrying slow provider responses without creating a new user prompt.

## Why?

This extension may help in scenarios where a provider may have multiple upstream providers, and one of them is slow. By "retrying" the request, you request will be re-sent, and will hopefully be sent to a faster provider during the retry.

## Shortcuts

- `Ctrl+Alt+R`: Retry the in-progress assistant response

## Installation

### From local clone

```bash
pi install /path/to/pi-retry-response
```

### From GitHub

```bash
pi install git:github.com/arcanemachine/pi-retry-response
```

## Configuration

Configure the shortcut in Pi settings (`.pi/settings.json` in a project or
`~/.pi/agent/settings.json` globally):

```json
{
  "pi-retry-response": {
    "shortcut": "ctrl+alt+r"
  }
}
```

Project settings override global settings.

## Behavior

1. If Pi is idle, retry does nothing except show a notice.
2. If Pi is streaming, retry aborts the current assistant response.
3. Pi then starts a hidden trigger turn.
4. The provider context for that trigger strips the aborted assistant output and hidden trigger message, so the provider sees the same context as the interrupted turn.

## Notes

- Shortcut conflicts may still occur depending on other installed extensions and active keymaps.
-
