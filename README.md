# pi-refresh

> Retry the current/last turn with a shortcut (default `Ctrl+Alt+R`).

A Pi extension that lets you quickly re-issue the last user prompt, including while a response is still streaming.

## Shortcuts

- `Ctrl+Alt+R`: Refresh last/in-progress response

## Installation

### From local clone

```bash
pi install /path/to/pi-refresh
```

### From GitHub

```bash
pi install git:github.com/arcanemachine/pi-refresh
```

## Configuration

Default shortcuts can be overridden with environment variables:

```bash
PI_REFRESH_SHORTCUT="ctrl+alt+r" pi
```

## Behavior

1. If Pi is idle, refresh sends the last user message immediately.
2. If Pi is streaming, refresh aborts the current turn and queues the retry as steering.
3. If no prior user message is found, the extension shows a warning.

## Notes

- Shortcut conflicts may still occur depending on other installed extensions and active keymaps.
- This extension currently extracts text from the last user message. Non-text-only payload refresh is a future improvement.
