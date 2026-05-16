# IDEAS

## Near-term

1. Add cooldown/debounce to avoid repeated rapid retries.
2. Status line indicator for queued refresh attempts.
3. Better handling when refresh is requested during tool execution.

## Mid-term

1. Config file support (`.pi/settings.json`) instead of env-only shortcut overrides.
2. Command equivalent (`/refresh`) for non-shortcut workflows.
3. Optional cleanup or hiding of refresh-aborted assistant output in the UI.

## Long-term

1. Provider-aware retry strategy (e.g., model/provider cycling hints).
2. Retry policy profiles (fast retry, conservative retry, tool-safe retry).
3. Extension telemetry hooks for retry outcomes and latency tracking.
