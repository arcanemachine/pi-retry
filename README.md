# pi-refresh

> Retry the in-progress assistant response with a shortcut (default `Ctrl+Alt+R`).

A Pi extension for aborting a slow active response and immediately starting a fresh provider request for the same assistant turn.

## Shortcuts

- `Ctrl+Alt+R`: Refresh the in-progress assistant response

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

1. If Pi is idle, refresh does nothing except show a notice.
2. If Pi is streaming, refresh aborts the current assistant response.
3. Pi then starts a hidden trigger turn.
4. The provider context for that trigger strips the aborted assistant output and hidden trigger message, so the provider sees the same context as the interrupted turn.

## Notes

- Shortcut conflicts may still occur depending on other installed extensions and active keymaps.
- Refresh is intended for retrying slow provider responses without creating a new user prompt.
